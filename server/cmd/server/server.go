package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	appconfig "github.com/besartmorina/clinks/server/internal/config"
)

const (
	defaultReadHeaderTimeout = 5 * time.Second
	defaultReadTimeout       = 15 * time.Second
	defaultWriteTimeout      = 15 * time.Second
	defaultIdleTimeout       = time.Minute
	defaultShutdownTimeout   = 10 * time.Second
)

type HTTPServer struct {
	server          *http.Server
	shutdownTimeout time.Duration
	logger          *slog.Logger
}

func NewHTTPServer(
	config appconfig.HTTPConfig,
	handler http.Handler,
	logger *slog.Logger,
) *HTTPServer {
	return &HTTPServer{
		server: &http.Server{
			Addr:              config.Address(),
			Handler:           handler,
			ReadHeaderTimeout: defaultReadHeaderTimeout,
			ReadTimeout:       defaultReadTimeout,
			WriteTimeout:      defaultWriteTimeout,
			IdleTimeout:       defaultIdleTimeout,
		},
		shutdownTimeout: defaultShutdownTimeout,
		logger:          logger,
	}
}

func (server *HTTPServer) Run(ctx context.Context) error {
	var listenConfig net.ListenConfig

	listener, err := listenConfig.Listen(
		ctx,
		"tcp",
		server.server.Addr,
	)
	if err != nil {
		return fmt.Errorf(
			"listen on %s: %w",
			server.server.Addr,
			err,
		)
	}

	serverErr := make(chan error, 1)

	go func() {
		server.logger.Info(
			"clinks server starting",
			"address",
			listener.Addr().String(),
		)

		serverErr <- server.server.Serve(listener)
	}()

	select {
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return errors.New(
				"HTTP server stopped unexpectedly",
			)
		}

		return fmt.Errorf(
			"serve HTTP server: %w",
			err,
		)

	case <-ctx.Done():
		server.logger.Info(
			"shutdown signal received",
			"timeout",
			server.shutdownTimeout,
		)
	}

	shutdownErr := server.shutdown(ctx)

	serveErr := <-serverErr
	if serveErr != nil &&
		!errors.Is(serveErr, http.ErrServerClosed) {
		shutdownErr = errors.Join(
			shutdownErr,
			fmt.Errorf(
				"serve HTTP server: %w",
				serveErr,
			),
		)
	}

	if shutdownErr != nil {
		return shutdownErr
	}

	server.logger.Info("clinks server exited cleanly")

	return nil
}

func (server *HTTPServer) shutdown(
	ctx context.Context,
) error {
	shutdownCtx, cancel := context.WithTimeout(
		context.WithoutCancel(ctx),
		server.shutdownTimeout,
	)
	defer cancel()

	if err := server.server.Shutdown(shutdownCtx); err != nil {
		server.logger.Warn(
			"graceful shutdown failed, forcing close",
			"error",
			err,
		)

		shutdownErr := fmt.Errorf(
			"gracefully shut down HTTP server: %w",
			err,
		)

		if closeErr := server.server.Close(); closeErr != nil &&
			!errors.Is(closeErr, http.ErrServerClosed) {
			shutdownErr = errors.Join(
				shutdownErr,
				fmt.Errorf(
					"force close HTTP server: %w",
					closeErr,
				),
			)
		}

		return shutdownErr
	}

	return nil
}
