package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	appconfig "github.com/besartmorina/clinks/server/internal/config"
)

//go:generate go tool wire

type workerCommand string

const (
	commandRun         workerCommand = "run"
	commandHealthcheck workerCommand = "healthcheck"
)

func main() {
	slog.SetDefault(
		slog.New(
			slog.NewJSONHandler(
				os.Stdout,
				nil,
			),
		),
	)

	if err := run(os.Args[1:]); err != nil {
		slog.Error(
			"worker stopped",
			"error",
			err,
		)
		os.Exit(1)
	}
}

func run(args []string) error {
	command, err := parseWorkerCommand(args)
	if err != nil {
		return err
	}

	settings, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf(
			"load configuration: %w",
			err,
		)
	}

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	slog.Info(
		"executing worker command",
		"command",
		command,
	)

	switch command {
	case commandRun:
		return runWorker(ctx, &settings)

	case commandHealthcheck:
		return runWorkerHealthcheck(ctx, &settings)

	default:
		panic("unreachable worker command")
	}
}

func runWorker(
	ctx context.Context,
	settings *appconfig.Config,
) error {
	app, cleanup, err := InitializeWorker(
		ctx,
		settings,
	)
	if err != nil {
		return fmt.Errorf(
			"build worker: %w",
			err,
		)
	}
	defer cleanup()

	return app.Run(ctx)
}

func runWorkerHealthcheck(
	ctx context.Context,
	settings *appconfig.Config,
) error {
	healthcheck, cleanup, err := InitializeWorkerHealthcheck(
		ctx,
		settings,
	)
	if err != nil {
		return fmt.Errorf(
			"build worker healthcheck: %w",
			err,
		)
	}
	defer cleanup()

	return healthcheck.Run(ctx)
}

func parseWorkerCommand(
	args []string,
) (workerCommand, error) {
	switch len(args) {
	case 0:
		return commandRun, nil

	case 1:
		switch args[0] {
		case "run", "worker":
			return commandRun, nil

		case "healthcheck":
			return commandHealthcheck, nil

		default:
			return "", fmt.Errorf(
				"unknown command %q "+
					"(supported commands: run, worker, healthcheck)",
				args[0],
			)
		}

	default:
		return "", fmt.Errorf(
			"expected at most one command, got %d arguments",
			len(args),
		)
	}
}
