package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	appconfig "github.com/besartmorina/clinks/server/config"
)

type command string

const (
	commandServer      command = "server"
	commandMigrate     command = "migrate"
	commandHealthcheck command = "healthcheck"
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
			"application stopped",
			"error",
			err,
		)
		os.Exit(1)
	}
}

func run(args []string) error {
	cmd, err := parseCommand(args)
	if err != nil {
		return err
	}

	config, err := appconfig.Load(configProfile(cmd))
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
		"executing command",
		"command",
		cmd,
	)

	switch cmd {
	case commandServer:
		return runServer(ctx, &config)

	case commandMigrate:
		return runMigration(ctx, &config)

	case commandHealthcheck:
		return runHealthcheck(ctx, &config)

	default:
		panic("unreachable command")
	}
}

func configProfile(cmd command) appconfig.Profile {
	switch cmd {
	case commandServer:
		return appconfig.ProfileAPI
	case commandMigrate:
		return appconfig.ProfileMigration
	case commandHealthcheck:
		return appconfig.ProfileHealthcheck
	default:
		panic("unreachable command")
	}
}

func parseCommand(args []string) (command, error) {
	switch len(args) {
	case 0:
		return commandServer, nil

	case 1:
		cmd := command(args[0])

		switch cmd {
		case commandServer,
			commandMigrate,
			commandHealthcheck:
			return cmd, nil

		default:
			return "", fmt.Errorf(
				"unknown command %q "+
					"(supported commands: server, migrate, healthcheck)",
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
