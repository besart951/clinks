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

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if err := run(os.Args[1:]); err != nil {
		slog.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	settings, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	app, cleanup, err := InitializeWorker(ctx, &settings)
	if err != nil {
		return fmt.Errorf("build worker: %w", err)
	}
	defer cleanup()

	command := "run"
	if len(args) > 0 {
		command = args[0]
	}

	slog.Info("executing worker command", "command", command)

	switch command {
	case "run", "worker":
		return app.Run(ctx)
	case "healthcheck":
		return app.Healthcheck(ctx)
	default:
		return fmt.Errorf("unknown command %q (supported commands: run, healthcheck)", command)
	}
}
