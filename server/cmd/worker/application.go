package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/auth"
	appconfig "github.com/besartmorina/clinks/server/config"
	"github.com/besartmorina/clinks/server/mail"
	"github.com/besartmorina/clinks/server/postgres"
)

const defaultWorkerHealthcheckTimeout = 5 * time.Second

type workerApplication struct {
	worker *clinks.InvitationWorker
}

func newWorkerApplication(
	worker *clinks.InvitationWorker,
) *workerApplication {
	return &workerApplication{
		worker: worker,
	}
}

func (app *workerApplication) run(ctx context.Context) error {
	if err := app.worker.Run(ctx); err != nil {
		if ctx.Err() != nil && errors.Is(err, context.Canceled) {
			return nil
		}

		return fmt.Errorf("run invitation worker: %w", err)
	}

	return nil
}

type workerHealthcheck struct {
	pool *pgxpool.Pool
}

func newWorkerHealthcheck(
	pool *pgxpool.Pool,
) *workerHealthcheck {
	return &workerHealthcheck{
		pool: pool,
	}
}

func (healthcheck *workerHealthcheck) run(
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
) mail.SMTPConfig {
	return mail.SMTPConfig{
		Host:       settings.SMTP.Host,
		Port:       settings.SMTP.Port,
		Username:   settings.SMTP.Username,
		Password:   settings.SMTP.Password,
		From:       settings.SMTP.From,
		RequireTLS: settings.SMTP.RequireTLS,
		Logger:     slog.Default(),
	}
}

func workerInvitationTokenConfig(
	settings *appconfig.Config,
) auth.InvitationTokenConfig {
	return auth.InvitationTokenConfig{
		Secret: settings.Invites.TokenSecret,
	}
}

func workerInviteBaseURL(
	settings *appconfig.Config,
) string {
	return settings.Invites.PublicBaseURL
}
