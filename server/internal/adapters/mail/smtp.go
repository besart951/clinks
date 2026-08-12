// Package mail contains delivery adapters for outbound transactional messages.
package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	StatusNotConfigured = "not_configured"
	StatusFailed        = "failed"
	StatusSent          = "sent"

	defaultDialTimeout = 10 * time.Second
)

type SMTPConfig struct {
	Host       string
	Port       string
	Username   string
	Password   string
	From       string
	RequireTLS bool
}

type SMTPMailer struct {
	config SMTPConfig
}

func NewSMTPMailer(config *SMTPConfig) *SMTPMailer {
	if config == nil {
		return &SMTPMailer{}
	}
	return &SMTPMailer{config: *config}
}

func (mailer *SMTPMailer) Send(ctx context.Context, invitation *domain.Invitation) (string, error) {
	if invitation == nil {
		return StatusFailed, errors.New("invitation cannot be nil")
	}

	if mailer.config.Host == "" {
		slog.Debug("smtp mailer skipped: host not configured", "recipient", invitation.Email)
		return StatusNotConfigured, nil
	}

	if err := ctx.Err(); err != nil {
		slog.Warn("smtp mailer canceled before dial", "recipient", invitation.Email, "error", err)
		return StatusFailed, err
	}

	address := net.JoinHostPort(mailer.config.Host, mailer.config.Port)
	dialer := &net.Dialer{Timeout: defaultDialTimeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		slog.Error("smtp connection failed", "address", address, "error", err)
		return StatusFailed, fmt.Errorf("smtp connection failed: %w", err)
	}

	if deadline, ok := ctx.Deadline(); ok {
		if deadlineErr := conn.SetDeadline(deadline); deadlineErr != nil {
			if closeErr := conn.Close(); closeErr != nil {
				slog.Debug("failed to close SMTP connection", "error", closeErr)
			}
			return StatusFailed, fmt.Errorf("set SMTP connection deadline: %w", deadlineErr)
		}
	}

	client, err := smtp.NewClient(conn, mailer.config.Host)
	if err != nil {
		if closeErr := conn.Close(); closeErr != nil {
			slog.Debug("failed to close SMTP connection", "error", closeErr)
		}
		slog.Error("smtp client handshaking failed", "host", mailer.config.Host, "error", err)
		return StatusFailed, fmt.Errorf("smtp client failed: %w", err)
	}
	defer func() {
		if closeErr := client.Close(); closeErr != nil {
			slog.Debug("failed to close smtp client", "error", closeErr)
		}
	}()

	hasStartTLS, _ := client.Extension("STARTTLS")
	if mailer.config.RequireTLS && !hasStartTLS {
		return StatusFailed, errors.New("smtp server does not support STARTTLS")
	}

	if hasStartTLS {
		tlsConfig := &tls.Config{
			ServerName: mailer.config.Host,
			MinVersion: tls.VersionTLS12,
		}
		if tlsErr := client.StartTLS(tlsConfig); tlsErr != nil {
			return StatusFailed, fmt.Errorf("smtp starttls failed: %w", tlsErr)
		}
	}

	if mailer.config.Username != "" {
		auth := smtp.PlainAuth("", mailer.config.Username, mailer.config.Password, mailer.config.Host)
		if authErr := client.Auth(auth); authErr != nil {
			slog.Error("smtp auth failed", "username", mailer.config.Username, "error", authErr)
			return StatusFailed, fmt.Errorf("smtp auth failed: %w", authErr)
		}
	}

	if mailErr := client.Mail(sanitizeHeader(mailer.config.From)); mailErr != nil {
		return StatusFailed, fmt.Errorf("smtp mail command failed: %w", mailErr)
	}
	if rcptErr := client.Rcpt(sanitizeHeader(string(invitation.Email))); rcptErr != nil {
		return StatusFailed, fmt.Errorf("smtp rcpt command failed: %w", rcptErr)
	}

	wc, dataErr := client.Data()
	if dataErr != nil {
		return StatusFailed, fmt.Errorf("smtp data command failed: %w", dataErr)
	}

	message := invitationMessage(mailer.config.From, invitation)
	if _, writeErr := wc.Write([]byte(message)); writeErr != nil {
		if closeErr := wc.Close(); closeErr != nil {
			slog.Debug("failed to close SMTP data writer", "error", closeErr)
		}
		return StatusFailed, fmt.Errorf("smtp write body failed: %w", writeErr)
	}

	if closeErr := wc.Close(); closeErr != nil {
		return StatusFailed, fmt.Errorf("smtp close data writer failed: %w", closeErr)
	}

	slog.Info("smtp invitation mail dispatched", "recipient", invitation.Email, "invitation_id", invitation.ID)
	if quitErr := client.Quit(); quitErr != nil {
		slog.Debug("failed to quit smtp client", "error", quitErr)
	}

	return StatusSent, nil
}

func invitationMessage(from string, invitation *domain.Invitation) string {
	cleanFrom := sanitizeHeader(from)
	cleanTo := sanitizeHeader(string(invitation.Email))
	subject := "Clinks invitation"

	headers := []string{
		"From: " + cleanFrom,
		"To: " + cleanTo,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		"You have been invited to a Clinks tenant. Accept the invitation: " + invitation.Acceptance,
	}

	return strings.Join(headers, "\r\n")
}

func sanitizeHeader(value string) string {
	r := strings.NewReplacer("\r", "", "\n", "")
	return r.Replace(value)
}
