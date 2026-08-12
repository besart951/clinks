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
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cfg, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	app, cleanup, err := InitializeApplication(ctx, &cfg)
	if err != nil {
		return fmt.Errorf("build application: %w", err)
	}
	defer cleanup()

	command := "server"
	if len(args) > 0 {
		command = args[0]
	}

	slog.Info("executing command", "command", command)

	switch command {
	case "server":
		return app.Run(ctx, &cfg.HTTP)
	case "migrate":
		return app.MigrateAndBootstrap(ctx, cfg.Bootstrap)
	case "healthcheck":
		return app.Healthcheck(ctx)
	default:
		return fmt.Errorf("unknown command %q (supported commands: server, migrate, healthcheck)", command)
	}
}
