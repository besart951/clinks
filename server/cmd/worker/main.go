package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(os.Args[1:]); err != nil {
		slog.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	settings, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	pool, err := postgres.NewPool(ctx, postgres.PoolConfig{
		DatabaseURL: settings.Database.URL, MaxConns: settings.Database.MaxConns,
		MinConns: settings.Database.MinConns, MaxConnLifetime: settings.Database.ConnMaxLifetime,
		MaxConnIdleTime: settings.Database.ConnMaxIdleTime, HealthCheckPeriod: settings.Database.HealthCheck,
	})
	if err != nil {
		return err
	}
	defer pool.Close()
	if len(arguments) > 0 && arguments[0] == "healthcheck" {
		return pool.Ping(ctx)
	}
	if len(arguments) > 0 {
		return fmt.Errorf("unknown command %q", arguments[0])
	}
	tokens, err := authadapter.NewInvitationTokenSigner(authadapter.InvitationTokenConfig{Secret: settings.Invites.TokenSecret})
	if err != nil {
		return err
	}
	mailer := mailadapter.NewSMTPMailer(&mailadapter.SMTPConfig{
		Host: settings.SMTP.Host, Port: settings.SMTP.Port, Username: settings.SMTP.Username,
		Password: settings.SMTP.Password, From: settings.SMTP.From, RequireTLS: settings.SMTP.RequireTLS,
	})
	worker := service.NewInvitationWorker(postgres.NewOutboxRepository(pool), mailer, tokens, settings.Invites.PublicBaseURL)
	return worker.Run(ctx)
}
