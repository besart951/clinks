//go:build wireinject

package main

import (
	"context"

	"github.com/google/wire"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

var workerProviderSet = wire.NewSet(
	workerPoolConfig,
	workerSMTPConfig,
	workerInvitationTokenConfig,
	workerInviteBaseURL,
	postgres.NewPool,
	postgres.NewOutboxRepository,
	mailadapter.NewSMTPMailer,
	authadapter.NewInvitationTokenSigner,
	wire.Bind(new(ports.OutboxRepository), new(*postgres.OutboxRepository)),
	wire.Bind(new(ports.InvitationMailer), new(*mailadapter.SMTPMailer)),
	wire.Bind(new(ports.InvitationTokenSigner), new(*authadapter.InvitationTokenSigner)),
	newInvitationWorker,
	NewWorkerApplication,
)

func InitializeWorker(context.Context, *appconfig.Config) (*WorkerApplication, error) {
	wire.Build(workerProviderSet)
	return nil, nil
}
