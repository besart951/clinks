package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

type WorkerApplication struct {
	pool   *pgxpool.Pool
	worker *service.InvitationWorker
}

func NewWorkerApplication(
	pool *pgxpool.Pool,
	worker *service.InvitationWorker,
) *WorkerApplication {
	return &WorkerApplication{pool: pool, worker: worker}
}

func (application *WorkerApplication) Run(ctx context.Context) error {
	defer application.pool.Close()
	return application.worker.Run(ctx)
}

func (application *WorkerApplication) Healthcheck(ctx context.Context) error {
	defer application.pool.Close()
	return application.pool.Ping(ctx)
}

func workerPoolConfig(settings *appconfig.Config) postgres.PoolConfig {
	return postgres.PoolConfig{
		DatabaseURL: settings.Database.URL, MaxConns: settings.Database.MaxConns,
		MinConns: settings.Database.MinConns, MaxConnLifetime: settings.Database.ConnMaxLifetime,
		MaxConnIdleTime:   settings.Database.ConnMaxIdleTime,
		HealthCheckPeriod: settings.Database.HealthCheck,
	}
}

func workerSMTPConfig(settings *appconfig.Config) *mailadapter.SMTPConfig {
	return &mailadapter.SMTPConfig{
		Host: settings.SMTP.Host, Port: settings.SMTP.Port,
		Username: settings.SMTP.Username, Password: settings.SMTP.Password,
		From: settings.SMTP.From, RequireTLS: settings.SMTP.RequireTLS,
	}
}

func workerInvitationTokenConfig(settings *appconfig.Config) authadapter.InvitationTokenConfig {
	return authadapter.InvitationTokenConfig{Secret: settings.Invites.TokenSecret}
}

func workerInviteBaseURL(settings *appconfig.Config) string {
	return settings.Invites.PublicBaseURL
}

func newInvitationWorker(
	outbox ports.OutboxRepository,
	mailer ports.InvitationMailer,
	tokens ports.InvitationTokenSigner,
	inviteBaseURL string,
) *service.InvitationWorker {
	return service.NewInvitationWorker(outbox, mailer, tokens, inviteBaseURL)
}
