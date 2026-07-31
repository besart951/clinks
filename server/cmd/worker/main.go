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

func run(arguments []string) error {
	settings, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	application, err := InitializeWorker(ctx, &settings)
	if err != nil {
		return fmt.Errorf("build worker: %w", err)
	}
	if len(arguments) > 0 && arguments[0] == "healthcheck" {
		return application.Healthcheck(ctx)
	}
	if len(arguments) > 0 {
		return fmt.Errorf("unknown command %q", arguments[0])
	}
	return application.Run(ctx)
}
