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

func run(arguments []string) error {
	config, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	application, err := InitializeApplication(ctx, &config)
	if err != nil {
		return fmt.Errorf("build application: %w", err)
	}
	command := "server"
	if len(arguments) > 0 {
		command = arguments[0]
	}
	switch command {
	case "server":
		return application.Run(ctx, &config.HTTP)
	case "migrate":
		return application.MigrateAndBootstrap(ctx, config.Bootstrap)
	case "healthcheck":
		return application.Healthcheck(ctx)
	default:
		return fmt.Errorf("unknown command %q", command)
	}
}
