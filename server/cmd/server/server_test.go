package main

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"

	appconfig "github.com/besartmorina/clinks/server/internal/config"
)

func TestNewServerBuildsHTTPServerFromConfig(t *testing.T) {
	handler := http.NewServeMux()
	config := appconfig.HTTPConfig{Port: "8081"}

	server := NewServer(&config, handler)

	if server.httpServer.Addr != ":8081" {
		t.Errorf("Addr = %q, want %q", server.httpServer.Addr, ":8081")
	}
	if server.httpServer.Handler != handler {
		t.Error("Handler was not preserved")
	}
	if server.httpServer.ReadHeaderTimeout != defaultReadHeaderTimeout {
		t.Errorf("ReadHeaderTimeout = %s, want %s", server.httpServer.ReadHeaderTimeout, defaultReadHeaderTimeout)
	}
	if server.httpServer.ReadTimeout != defaultReadTimeout {
		t.Errorf("ReadTimeout = %s, want %s", server.httpServer.ReadTimeout, defaultReadTimeout)
	}
	if server.httpServer.WriteTimeout != defaultWriteTimeout {
		t.Errorf("WriteTimeout = %s, want %s", server.httpServer.WriteTimeout, defaultWriteTimeout)
	}
	if server.httpServer.IdleTimeout != defaultIdleTimeout {
		t.Errorf("IdleTimeout = %s, want %s", server.httpServer.IdleTimeout, defaultIdleTimeout)
	}
	if server.shutdownTimeout != defaultShutdownTimeout {
		t.Errorf("shutdownTimeout = %s, want %s", server.shutdownTimeout, defaultShutdownTimeout)
	}
}

func TestServerRunShutsDownWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	listener, err := new(net.ListenConfig).Listen(ctx, "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve address: %v", err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("release address: %v", err)
	}

	server := NewServer(
		&appconfig.HTTPConfig{Port: address[len("127.0.0.1:"):]},
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}),
	)
	result := make(chan error, 1)
	go func() { result <- server.Run(ctx) }()

	deadline := time.Now().Add(time.Second)
	for {
		connection, dialErr := new(net.Dialer).DialContext(ctx, "tcp", address)
		if dialErr == nil {
			if err := connection.Close(); err != nil {
				t.Fatalf("close connection: %v", err)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("server did not start: %v", dialErr)
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	if err := <-result; err != nil {
		t.Errorf("Run() error = %v, want nil", err)
	}
}
