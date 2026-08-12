package main

import (
	"context"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/auth"
	appconfig "github.com/besartmorina/clinks/server/config"
	"github.com/besartmorina/clinks/server/localization"
	"github.com/besartmorina/clinks/server/mail"
	"github.com/besartmorina/clinks/server/postgres"
)

// The worker composition validates SMTP before polling the outbox.
func initializeWorker(
	ctx context.Context,
	config *appconfig.Config,
) (*workerApplication, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, workerPoolConfig(config))
	if err != nil {
		return nil, nil, err
	}
	store := postgres.NewStore(pool)

	fail := func(err error) (*workerApplication, func(), error) {
		cleanup()
		return nil, nil, err
	}

	mailer, err := mail.NewSMTPMailer(workerSMTPConfig(config))
	if err != nil {
		return fail(err)
	}

	tokens, err := auth.NewInvitationTokenSigner(
		workerInvitationTokenConfig(config),
	)
	if err != nil {
		return fail(err)
	}
	catalog, err := localization.NewProductCatalog(store)
	if err != nil {
		return fail(err)
	}

	worker, err := clinks.NewInvitationWorker(clinks.WorkerDependencies{
		Outbox:        store,
		Mailer:        mailer,
		Tokens:        tokens,
		Messages:      catalog,
		InviteBaseURL: workerInviteBaseURL(config),
	})
	if err != nil {
		return fail(err)
	}

	return newWorkerApplication(worker), cleanup, nil
}

func initializeWorkerHealthcheck(
	ctx context.Context,
	config *appconfig.Config,
) (*workerHealthcheck, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, workerPoolConfig(config))
	if err != nil {
		return nil, nil, err
	}

	return newWorkerHealthcheck(pool), cleanup, nil
}
