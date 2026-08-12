package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

const defaultWorkerHealthcheckTimeout = 5 * time.Second

type WorkerApplication struct {
	worker *service.InvitationWorker
}

func NewWorkerApplication(
	worker *service.InvitationWorker,
) *WorkerApplication {
	return &WorkerApplication{
		worker: worker,
	}
}

func (app *WorkerApplication) Run(ctx context.Context) error {
	if err := app.worker.Run(ctx); err != nil {
		if ctx.Err() != nil && errors.Is(err, context.Canceled) {
			return nil
		}

		return fmt.Errorf("run invitation worker: %w", err)
	}

	return nil
}

type WorkerHealthcheck struct {
	pool *pgxpool.Pool
}

func NewWorkerHealthcheck(
	pool *pgxpool.Pool,
) *WorkerHealthcheck {
	return &WorkerHealthcheck{
		pool: pool,
	}
}

func (healthcheck *WorkerHealthcheck) Run(
	ctx context.Context,
) error {
	ctx, cancel := context.WithTimeout(
		ctx,
		defaultWorkerHealthcheckTimeout,
	)
	defer cancel()

	if err := healthcheck.pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	return nil
}

func workerPoolConfig(
	settings *appconfig.Config,
) postgres.PoolConfig {
	return postgres.PoolConfig{
		DatabaseURL:       settings.Database.URL,
		MaxConns:          settings.Database.MaxConns,
		MinConns:          settings.Database.MinConns,
		MaxConnLifetime:   settings.Database.ConnMaxLifetime,
		MaxConnIdleTime:   settings.Database.ConnMaxIdleTime,
		HealthCheckPeriod: settings.Database.HealthCheck,
	}
}

func workerSMTPConfig(
	settings *appconfig.Config,
) *mailadapter.SMTPConfig {
	return &mailadapter.SMTPConfig{
		Host:       settings.SMTP.Host,
		Port:       settings.SMTP.Port,
		Username:   settings.SMTP.Username,
		Password:   settings.SMTP.Password,
		From:       settings.SMTP.From,
		RequireTLS: settings.SMTP.RequireTLS,
	}
}

func workerInvitationTokenConfig(
	settings *appconfig.Config,
) authadapter.InvitationTokenConfig {
	return authadapter.InvitationTokenConfig{
		Secret: settings.Invites.TokenSecret,
	}
}

func workerInviteBaseURL(
	settings *appconfig.Config,
) string {
	return settings.Invites.PublicBaseURL
}

func newInvitationWorker(
	outbox ports.OutboxRepository,
	mailer ports.InvitationMailer,
	tokens ports.InvitationTokenSigner,
	inviteBaseURL string,
) *service.InvitationWorker {
	return service.NewInvitationWorker(
		outbox,
		mailer,
		tokens,
		inviteBaseURL,
	)
}
