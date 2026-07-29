package mail_test

import (
	"context"
	"strings"
	"testing"

	"github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func TestSMTPMailer_NotConfigured(t *testing.T) {
	t.Parallel()

	mailer := mail.NewSMTPMailer(&mail.SMTPConfig{
		Host: "",
	})

	invitation := &domain.Invitation{
		ID:         "inv-123",
		Email:      "invited@example.com",
		Acceptance: "http://localhost/accept?token=abc",
	}

	status, err := mailer.Send(context.Background(), invitation)
	if err != nil {
		t.Fatalf("expected no error when unconfigured, got: %v", err)
	}
	if status != "not_configured" {
		t.Errorf("expected status 'not_configured', got %q", status)
	}
}

func TestSMTPMailer_CanceledContext(t *testing.T) {
	t.Parallel()

	mailer := mail.NewSMTPMailer(&mail.SMTPConfig{
		Host: "localhost",
		Port: "1025",
		From: "no-reply@clinks.test",
	})

	invitation := &domain.Invitation{
		ID:         "inv-123",
		Email:      "user@example.com",
		Acceptance: "http://localhost/accept?token=123",
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel context immediately

	status, err := mailer.Send(ctx, invitation)
	if err == nil {
		t.Fatal("expected error for canceled context, got nil")
	}
	if status != "failed" {
		t.Errorf("expected status 'failed', got %q", status)
	}
}

func TestSMTPMailer_MessageFormat(t *testing.T) {
	t.Parallel()

	invitation := &domain.Invitation{
		ID:         "inv-999",
		Email:      "target@domain.org",
		Acceptance: "https://clinks.app/accept?t=xyz",
	}

	// Send to a non-existent localhost port to verify connection failure error wrapping
	ctx := context.Background()
	mailer := mail.NewSMTPMailer(&mail.SMTPConfig{
		Host: "127.0.0.1",
		Port: "59999",
		From: "sender@clinks.app",
	})

	status, err := mailer.Send(ctx, invitation)
	if err == nil {
		t.Fatal("expected connection failure error, got nil")
	}
	if status != "failed" {
		t.Errorf("expected status 'failed', got %q", status)
	}
	if !strings.Contains(err.Error(), "connection failed") {
		t.Errorf("expected error message to mention connection failed, got: %v", err)
	}
}
