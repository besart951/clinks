// Package mail contains delivery adapters for outbound transactional messages.
package mail

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

type SMTPMailer struct {
	config SMTPConfig
}

func NewSMTPMailer(config *SMTPConfig) *SMTPMailer {
	return &SMTPMailer{config: *config}
}

func (mailer *SMTPMailer) Send(ctx context.Context, invitation *domain.Invitation) (string, error) {
	if mailer.config.Host == "" {
		slog.Debug("smtp mailer skipped: host not configured", "recipient", invitation.Email)
		return "not_configured", nil
	}
	if err := ctx.Err(); err != nil {
		slog.Warn("smtp mailer canceled before dial", "recipient", invitation.Email, "error", err)
		return "failed", err
	}

	address := mailer.config.Host + ":" + mailer.config.Port
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		slog.Error("smtp connection failed", "address", address, "error", err)
		return "failed", fmt.Errorf("smtp connection failed: %w", err)
	}

	client, err := smtp.NewClient(conn, mailer.config.Host)
	if err != nil {
		if closeErr := conn.Close(); closeErr != nil {
			slog.Debug("failed to close smtp connection", "error", closeErr)
		}
		slog.Error("smtp client handshaking failed", "host", mailer.config.Host, "error", err)
		return "failed", fmt.Errorf("smtp client failed: %w", err)
	}
	defer func() {
		if closeErr := client.Close(); closeErr != nil {
			slog.Debug("failed to close smtp client", "error", closeErr)
		}
	}()

	if mailer.config.Username != "" {
		auth := smtp.PlainAuth("", mailer.config.Username, mailer.config.Password, mailer.config.Host)
		if authErr := client.Auth(auth); authErr != nil {
			slog.Error("smtp auth failed", "username", mailer.config.Username, "error", authErr)
			return "failed", fmt.Errorf("smtp auth failed: %w", authErr)
		}
	}

	if mailErr := client.Mail(mailer.config.From); mailErr != nil {
		return "failed", fmt.Errorf("smtp mail command failed: %w", mailErr)
	}
	if rcptErr := client.Rcpt(string(invitation.Email)); rcptErr != nil {
		return "failed", fmt.Errorf("smtp rcpt command failed: %w", rcptErr)
	}

	wc, dataErr := client.Data()
	if dataErr != nil {
		return "failed", fmt.Errorf("smtp data command failed: %w", dataErr)
	}

	message := invitationMessage(mailer.config.From, invitation)
	if _, writeErr := wc.Write([]byte(message)); writeErr != nil {
		if closeErr := wc.Close(); closeErr != nil {
			slog.Debug("failed to close data writer on write error", "error", closeErr)
		}
		return "failed", fmt.Errorf("smtp write body failed: %w", writeErr)
	}

	if closeErr := wc.Close(); closeErr != nil {
		return "failed", fmt.Errorf("smtp close data writer failed: %w", closeErr)
	}

	slog.Info("smtp invitation mail dispatched", "recipient", invitation.Email, "invitation_id", invitation.ID)
	if quitErr := client.Quit(); quitErr != nil {
		slog.Debug("failed to quit smtp client", "error", quitErr)
	}
	return "sent", nil
}

func invitationMessage(from string, invitation *domain.Invitation) string {
	subject := "Clinks invitation"
	body := "You have been invited to a Clinks tenant. Accept the invitation: " + invitation.Acceptance
	return strings.Join([]string{"From: " + from, "To: " + string(invitation.Email), "Subject: " + subject, "", body}, "\r\n")
}
