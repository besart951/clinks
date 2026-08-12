package mail_test

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/mail"
)

func TestSMTPMailer_NotConfigured(t *testing.T) {
	t.Parallel()

	_, err := mail.NewSMTPMailer(mail.SMTPConfig{
		Host:   "",
		Logger: testLogger(),
	})
	if err == nil {
		t.Fatal("expected configuration error")
	}
}

func TestSMTPMailer_CanceledContext(t *testing.T) {
	t.Parallel()

	mailer, err := mail.NewSMTPMailer(mail.SMTPConfig{
		Host:   "localhost",
		Port:   "1025",
		From:   "no-reply@clinks.test",
		Logger: testLogger(),
	})
	if err != nil {
		t.Fatal(err)
	}
	message := clinks.InvitationMessage{Recipient: "user@example.com", Subject: "Invite", Body: "Accept"}

	ctx, cancel := context.WithCancel(t.Context())
	cancel() // cancel context immediately

	err = mailer.Send(ctx, message)
	if err == nil {
		t.Fatal("expected error for canceled context, got nil")
	}
}

func TestSMTPMailer_MessageFormat(t *testing.T) {
	t.Parallel()

	message := clinks.InvitationMessage{Recipient: "target@domain.org", Subject: "Invite", Body: "Accept"}

	// Send to a non-existent localhost port to verify connection failure error wrapping
	ctx := t.Context()
	mailer, constructorErr := mail.NewSMTPMailer(mail.SMTPConfig{
		Host:   "127.0.0.1",
		Port:   "59999",
		From:   "sender@clinks.app",
		Logger: testLogger(),
	})
	if constructorErr != nil {
		t.Fatal(constructorErr)
	}

	err := mailer.Send(ctx, message)
	if err == nil {
		t.Fatal("expected connection failure error, got nil")
	}
	if !strings.Contains(err.Error(), "connect to") {
		t.Errorf("expected error message to mention connection, got: %v", err)
	}
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
