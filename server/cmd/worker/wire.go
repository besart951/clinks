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

var workerConfigSet = wire.NewSet(
	workerPoolConfig,
	workerSMTPConfig,
	workerInvitationTokenConfig,
	workerInviteBaseURL,
)

var workerPostgresSet = wire.NewSet(
	postgres.NewPool,

	postgres.NewOutboxRepository,
	wire.Bind(
		new(ports.OutboxRepository),
		new(*postgres.OutboxRepository),
	),
)

var workerMailSet = wire.NewSet(
	mailadapter.NewSMTPMailer,
	wire.Bind(
		new(ports.InvitationMailer),
		new(*mailadapter.SMTPMailer),
	),
)

var workerAuthSet = wire.NewSet(
	authadapter.NewInvitationTokenSigner,
	wire.Bind(
		new(ports.InvitationTokenSigner),
		new(*authadapter.InvitationTokenSigner),
	),
)

var invitationWorkerSet = wire.NewSet(
	newInvitationWorker,
	NewWorkerApplication,
)

var workerProviderSet = wire.NewSet(
	workerConfigSet,
	workerPostgresSet,
	workerMailSet,
	workerAuthSet,
	invitationWorkerSet,
)

// InitializeWorker constructs the invitation worker dependency graph.
func InitializeWorker(
	ctx context.Context,
	config *appconfig.Config,
) (*WorkerApplication, func(), error) {
	wire.Build(workerProviderSet)

	return nil, nil, nil
}

var workerHealthcheckSet = wire.NewSet(
	workerPoolConfig,
	postgres.NewPool,
	NewWorkerHealthcheck,
)

// InitializeWorkerHealthcheck constructs only the dependencies required
// to verify worker database connectivity.
func InitializeWorkerHealthcheck(
	ctx context.Context,
	config *appconfig.Config,
) (*WorkerHealthcheck, func(), error) {
	wire.Build(workerHealthcheckSet)

	return nil, nil, nil
}
