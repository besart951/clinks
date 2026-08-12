package config

import (
	"slices"
	"strings"
	"testing"
	"time"
)

func TestConfigValidate(t *testing.T) {
	valid := Config{
		Database:  DatabaseConfig{MinConns: 2, MaxConns: 20},
		Auth:      AuthConfig{JWTSecret: strings.Repeat("a", 32), JWTTTL: time.Hour},
		Invites:   InviteConfig{TokenSecret: strings.Repeat("b", 32)},
		Bootstrap: BootstrapConfig{Password: "a secure password"},
	}
	tests := []struct {
		name   string
		config Config
		want   string
	}{
		{name: "valid", config: valid},
		{
			name: "minimum connections exceed maximum",
			config: func() Config {
				config := valid
				config.Database.MinConns = 21
				return config
			}(),
			want: "DATABASE_MIN_CONNS",
		},
		{
			name: "short JWT secret",
			config: func() Config {
				config := valid
				config.Auth.JWTSecret = "short"
				return config
			}(),
			want: "JWT_SECRET",
		},
		{
			name: "non-positive JWT TTL",
			config: func() Config {
				config := valid
				config.Auth.JWTTTL = 0
				return config
			}(),
			want: "JWT_TTL",
		},
		{
			name: "collects independent validation errors",
			config: func() Config {
				config := valid
				config.Database.MaxConns = 0
				config.Auth.JWTSecret = "short"
				return config
			}(),
			want: "DATABASE_MAX_CONNS",
		},
		{
			name: "placeholder administrator password",
			config: func() Config {
				config := valid
				config.Bootstrap.Password = "replace-with-a-real-password"
				return config
			}(),
			want: "ADMIN_PASSWORD",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.config.validate()
			if test.want == "" && err != nil {
				t.Fatalf("validate() error = %v", err)
			}
			if test.want != "" && (err == nil || !strings.Contains(err.Error(), test.want)) {
				t.Fatalf("validate() error = %v, want error containing %q", err, test.want)
			}
		})
	}
}

func TestLoad(t *testing.T) {
	t.Setenv("SERVER_PORT", "9090")
	t.Setenv("CORS_ORIGINS", "https://one.example,https://two.example")
	t.Setenv("DATABASE_URL", "postgres://test")
	t.Setenv("DATABASE_MAX_CONNS", "30")
	t.Setenv("DATABASE_MIN_CONNS", "3")
	t.Setenv("DATABASE_CONN_MAX_LIFETIME", "2h")
	t.Setenv("DATABASE_CONN_MAX_IDLE_TIME", "45m")
	t.Setenv("DATABASE_HEALTH_CHECK_PERIOD", "90s")
	t.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	t.Setenv("JWT_ISSUER", "test-issuer")
	t.Setenv("JWT_AUDIENCE", "test-audience")
	t.Setenv("JWT_TTL", "20m")
	t.Setenv("INVITATION_TOKEN_SECRET", strings.Repeat("b", 32))
	t.Setenv("ADMIN_EMAIL", "admin@example.com")
	t.Setenv("ADMIN_PASSWORD", "a secure password")
	t.Setenv("ADMIN_LOCALE", "de-CH")

	config, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if config.HTTP.Address() != ":9090" {
		t.Errorf("HTTP.Address() = %q, want %q", config.HTTP.Address(), ":9090")
	}
	if got, want := config.HTTP.CORSOrigins, []string{"https://one.example", "https://two.example"}; !slices.Equal(got, want) {
		t.Errorf("HTTP.CORSOrigins = %v, want %v", got, want)
	}
	if config.Database.MaxConns != 30 || config.Database.MinConns != 3 {
		t.Errorf("database connections = (%d, %d), want (30, 3)", config.Database.MaxConns, config.Database.MinConns)
	}
	if config.Auth.JWTTTL != 20*time.Minute {
		t.Errorf("Auth.JWTTTL = %v, want %v", config.Auth.JWTTTL, 20*time.Minute)
	}
}
