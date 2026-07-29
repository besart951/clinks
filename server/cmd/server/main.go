package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	appconfig "github.com/besartmorina/clinks/server/internal/config"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if err := run(); err != nil {
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	config, err := appconfig.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}

	ctx := context.Background()

	application, err := InitializeApplication(ctx, &config)
	if err != nil {
		return fmt.Errorf("build application: %w", err)
	}
	return application.Run(ctx, config.Bootstrap, &config.HTTP)
}
