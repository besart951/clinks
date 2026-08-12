// Package mail contains delivery adapters for outbound transactional messages.
package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	netmail "net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const defaultSMTPTimeout = 15 * time.Second

type SMTPConfig struct {
	Host       string
	Port       string
	Username   string
	Password   string
	From       string
	RequireTLS bool
	Timeout    time.Duration
	Logger     *slog.Logger
}

type SMTPMailer struct {
	address    string
	host       string
	username   string
	password   string
	from       netmail.Address
	requireTLS bool
	timeout    time.Duration
	logger     *slog.Logger
}

func NewSMTPMailer(config SMTPConfig) (*SMTPMailer, error) {
	if config.Logger == nil {
		return nil, errors.New("smtp mailer: logger is required")
	}
	host := strings.TrimSpace(config.Host)
	if host == "" {
		return nil, errors.New(
			"smtp mailer: host is required",
		)
	}

	port := strings.TrimSpace(config.Port)
	if port == "" {
		return nil, errors.New(
			"smtp mailer: port is required",
		)
	}

	from, err := netmail.ParseAddress(
		strings.TrimSpace(config.From),
	)
	if err != nil {
		return nil, fmt.Errorf(
			"smtp mailer: parse sender address: %w",
			err,
		)
	}

	if strings.TrimSpace(from.Address) == "" {
		return nil, errors.New(
			"smtp mailer: sender address is required",
		)
	}

	username := strings.TrimSpace(config.Username)

	if (username == "") != (config.Password == "") {
		return nil, errors.New(
			"smtp mailer: username and password must be configured together",
		)
	}

	timeout := config.Timeout
	if timeout <= 0 {
		timeout = defaultSMTPTimeout
	}

	return &SMTPMailer{
		address:    net.JoinHostPort(host, port),
		host:       host,
		username:   username,
		password:   config.Password,
		from:       *from,
		requireTLS: config.RequireTLS,
		timeout:    timeout,
		logger:     config.Logger,
	}, nil
}

func (mailer *SMTPMailer) Send(
	ctx context.Context,
	message domain.InvitationMessage,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if err := message.Recipient.Validate(); err != nil {
		return fmt.Errorf(
			"smtp mailer: invalid recipient: %w",
			err,
		)
	}

	if strings.TrimSpace(message.Subject) == "" || strings.TrimSpace(message.Body) == "" {
		return errors.New(
			"smtp mailer: invitation subject and body are required",
		)
	}
	if strings.ContainsAny(message.Subject, "\r\n") {
		return errors.New("smtp mailer: invitation subject contains a line break")
	}

	connection, err := mailer.dial(ctx)
	if err != nil {
		return err
	}

	client, err := smtp.NewClient(
		connection,
		mailer.host,
	)
	if err != nil {
		closeErr := connection.Close()

		return errors.Join(fmt.Errorf(
			"smtp mailer: create client: %w",
			err,
		), smtpCloseError("connection after client creation failure", closeErr))
	}

	closed := false

	defer func() {
		if !closed {
			if err := client.Close(); err != nil {
				mailer.logger.Debug("close SMTP client", "error", err)
			}
		}
	}()

	if err := mailer.startTLS(client); err != nil {
		return err
	}

	if err := mailer.authenticate(client); err != nil {
		return err
	}

	if err := client.Mail(mailer.from.Address); err != nil {
		return fmt.Errorf(
			"smtp mailer: MAIL FROM: %w",
			err,
		)
	}

	if err := client.Rcpt(
		string(message.Recipient),
	); err != nil {
		return fmt.Errorf(
			"smtp mailer: RCPT TO: %w",
			err,
		)
	}

	if err := writeInvitation(
		client,
		mailer.from,
		message,
	); err != nil {
		return err
	}

	// DATA has already been accepted by the SMTP server at this
	// point. A failed QUIT must not cause the message to be retried,
	// because that could result in duplicate delivery.
	if err := client.Quit(); err == nil {
		closed = true
	}

	return nil
}

func (mailer *SMTPMailer) dial(
	ctx context.Context,
) (net.Conn, error) {
	dialer := net.Dialer{
		Timeout: mailer.timeout,
	}

	connection, err := dialer.DialContext(
		ctx,
		"tcp",
		mailer.address,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"smtp mailer: connect to %s: %w",
			mailer.address,
			err,
		)
	}

	deadline := time.Now().Add(mailer.timeout)

	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}

	if err := connection.SetDeadline(deadline); err != nil {
		closeErr := connection.Close()

		return nil, errors.Join(fmt.Errorf(
			"smtp mailer: set connection deadline: %w",
			err,
		), smtpCloseError("connection after deadline failure", closeErr))
	}

	stop := context.AfterFunc(
		ctx,
		func() {
			if err := connection.Close(); err != nil {
				mailer.logger.Debug("close canceled SMTP connection", "error", err)
			}
		},
	)

	return &contextConnection{
		Conn: connection,
		stop: stop,
	}, nil
}

func (mailer *SMTPMailer) startTLS(
	client *smtp.Client,
) error {
	supported, _ := client.Extension("STARTTLS")

	if !supported {
		if mailer.requireTLS {
			return errors.New(
				"smtp mailer: server does not support STARTTLS",
			)
		}

		return nil
	}

	if err := client.StartTLS(
		&tls.Config{
			ServerName: mailer.host,
			MinVersion: tls.VersionTLS12,
		},
	); err != nil {
		return fmt.Errorf(
			"smtp mailer: STARTTLS: %w",
			err,
		)
	}

	return nil
}

func (mailer *SMTPMailer) authenticate(
	client *smtp.Client,
) error {
	if mailer.username == "" {
		return nil
	}

	auth := smtp.PlainAuth(
		"",
		mailer.username,
		mailer.password,
		mailer.host,
	)

	if err := client.Auth(auth); err != nil {
		return fmt.Errorf(
			"smtp mailer: authenticate: %w",
			err,
		)
	}

	return nil
}

func writeInvitation(
	client *smtp.Client,
	from netmail.Address,
	message domain.InvitationMessage,
) error {
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf(
			"smtp mailer: start DATA: %w",
			err,
		)
	}

	rendered := invitationMessage(
		from,
		message,
	)

	if _, err := io.WriteString(
		writer,
		rendered,
	); err != nil {
		closeErr := writer.Close()

		return errors.Join(fmt.Errorf(
			"smtp mailer: write DATA: %w",
			err,
		), smtpCloseError("message writer after write failure", closeErr))
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf(
			"smtp mailer: finish DATA: %w",
			err,
		)
	}

	return nil
}

func invitationMessage(
	from netmail.Address,
	invitation domain.InvitationMessage,
) string {
	to := netmail.Address{
		Address: string(invitation.Recipient),
	}

	var message strings.Builder

	fmt.Fprintf(
		&message,
		"From: %s\r\n",
		from.String(),
	)

	fmt.Fprintf(
		&message,
		"To: %s\r\n",
		to.String(),
	)

	fmt.Fprintf(&message, "Subject: %s\r\n", strings.TrimSpace(invitation.Subject))

	message.WriteString(
		"MIME-Version: 1.0\r\n",
	)

	message.WriteString(
		"Content-Type: text/plain; charset=UTF-8\r\n",
	)

	message.WriteString("\r\n")

	message.WriteString(strings.ReplaceAll(strings.TrimSpace(invitation.Body), "\n", "\r\n"))

	message.WriteString("\r\n")

	return message.String()
}

func smtpCloseError(resource string, err error) error {
	if err == nil {
		return nil
	}

	return fmt.Errorf("smtp mailer: close %s: %w", resource, err)
}

type contextConnection struct {
	net.Conn

	stop func() bool
}

func (connection *contextConnection) Close() error {
	connection.stop()

	return connection.Conn.Close()
}
