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

var configSet = wire.NewSet(
	workerPoolConfig,
	workerSMTPConfig,
	workerInvitationTokenConfig,
	workerInviteBaseURL,
)

var postgresSet = wire.NewSet(
	postgres.NewPool,
	postgres.NewOutboxRepository,
	wire.Bind(new(ports.OutboxRepository), new(*postgres.OutboxRepository)),
)

var mailSet = wire.NewSet(
	mailadapter.NewSMTPMailer,
	wire.Bind(new(ports.InvitationMailer), new(*mailadapter.SMTPMailer)),
)

var authSet = wire.NewSet(
	authadapter.NewInvitationTokenSigner,
	wire.Bind(new(ports.InvitationTokenSigner), new(*authadapter.InvitationTokenSigner)),
)

var workerSet = wire.NewSet(
	newInvitationWorker,
	NewWorkerApplication,
)

var workerProviderSet = wire.NewSet(
	configSet,
	postgresSet,
	mailSet,
	authSet,
	workerSet,
)

func InitializeWorker(ctx context.Context, cfg *appconfig.Config) (*WorkerApplication, func(), error) {
	wire.Build(workerProviderSet)
	return nil, nil, nil
}
