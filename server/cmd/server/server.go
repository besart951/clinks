package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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

type Server struct {
	httpServer      *http.Server
	shutdownTimeout time.Duration
}

func NewServer(config *appconfig.HTTPConfig, handler http.Handler) *Server {
	return &Server{
		httpServer: &http.Server{
			Addr:              config.Address(),
			Handler:           handler,
			ReadHeaderTimeout: defaultReadHeaderTimeout,
			ReadTimeout:       defaultReadTimeout,
			WriteTimeout:      defaultWriteTimeout,
			IdleTimeout:       defaultIdleTimeout,
		},
		shutdownTimeout: defaultShutdownTimeout,
	}
}

func (srv *Server) Run(ctx context.Context) error {
	serverErr := make(chan error, 1)

	go func() {
		slog.Info("clinks server starting", "address", srv.httpServer.Addr)
		serverErr <- srv.httpServer.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP server: %w", err)
		}
		return errors.New("HTTP server stopped unexpectedly before receiving shutdown signal")

	case <-ctx.Done():
		slog.Info("shutdown signal received, draining connections", "timeout", srv.shutdownTimeout)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), srv.shutdownTimeout)
	defer cancel()

	shutdownErr := srv.httpServer.Shutdown(shutdownCtx)
	if shutdownErr != nil {
		slog.Warn("graceful shutdown timed out, forcing close", "error", shutdownErr)
		closeErr := srv.httpServer.Close()
		if closeErr != nil && !errors.Is(closeErr, http.ErrServerClosed) {
			shutdownErr = errors.Join(shutdownErr, fmt.Errorf("force close HTTP server: %w", closeErr))
		}
	}

	if err := <-serverErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP server: %w", err)
	}

	if shutdownErr != nil {
		return fmt.Errorf("gracefully shut down HTTP server: %w", shutdownErr)
	}

	slog.Info("clinks server exited cleanly")
	return nil
}
