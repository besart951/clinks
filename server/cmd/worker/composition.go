package main

import (
	"context"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	"github.com/besartmorina/clinks/server/internal/adapters/localization"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
)

// InitializeWorker constructs the worker graph. SMTP configuration is checked
// here so the run command fails before it starts polling the outbox.
func InitializeWorker(
	ctx context.Context,
	config *appconfig.Config,
) (*WorkerApplication, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, workerPoolConfig(config))
	if err != nil {
		return nil, nil, err
	}
	store := postgres.NewStore(pool)

	fail := func(err error) (*WorkerApplication, func(), error) {
		cleanup()
		return nil, nil, err
	}

	mailer, err := mailadapter.NewSMTPMailer(workerSMTPConfig(config))
	if err != nil {
		return fail(err)
	}

	tokens, err := authadapter.NewInvitationTokenSigner(
		workerInvitationTokenConfig(config),
	)
	if err != nil {
		return fail(err)
	}
	catalog, err := localization.NewProductCatalog(store)
	if err != nil {
		return fail(err)
	}

	worker, err := newInvitationWorker(
		store,
		mailer,
		tokens,
		catalog,
		workerInviteBaseURL(config),
	)
	if err != nil {
		return fail(err)
	}

	return NewWorkerApplication(worker), cleanup, nil
}

func InitializeWorkerHealthcheck(
	ctx context.Context,
	config *appconfig.Config,
) (*WorkerHealthcheck, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, workerPoolConfig(config))
	if err != nil {
		return nil, nil, err
	}

	return NewWorkerHealthcheck(pool), cleanup, nil
}
