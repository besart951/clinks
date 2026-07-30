// Package config loads process configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	HTTP      HTTPConfig
	Database  DatabaseConfig
	Auth      AuthConfig
	Invites   InviteConfig
	SMTP      SMTPConfig
	OIDC      OIDCConfig
	Bootstrap BootstrapConfig
}

type HTTPConfig struct {
	Port                string   `env:"SERVER_PORT" envDefault:"8080"`
	CORSOrigins         []string `env:"CORS_ORIGINS" envDefault:"http://localhost:5173,http://localhost:5174,http://localhost:5175" envSeparator:","`
	SessionCookieName   string   `env:"SESSION_COOKIE_NAME" envDefault:"clinks_session"`
	SessionCookieSecure bool     `env:"SESSION_COOKIE_SECURE" envDefault:"false"`
	SessionCookieDomain string   `env:"SESSION_COOKIE_DOMAIN"`
}

type DatabaseConfig struct {
	URL             string        `env:"DATABASE_URL,required"`
	MaxConns        int32         `env:"DATABASE_MAX_CONNS" envDefault:"20"`
	MinConns        int32         `env:"DATABASE_MIN_CONNS" envDefault:"2"`
	ConnMaxLifetime time.Duration `env:"DATABASE_CONN_MAX_LIFETIME" envDefault:"1h"`
	ConnMaxIdleTime time.Duration `env:"DATABASE_CONN_MAX_IDLE_TIME" envDefault:"30m"`
	HealthCheck     time.Duration `env:"DATABASE_HEALTH_CHECK_PERIOD" envDefault:"1m"`
}

type AuthConfig struct {
	JWTSecret   string        `env:"JWT_SECRET,required"`
	JWTIssuer   string        `env:"JWT_ISSUER" envDefault:"clinks"`
	JWTAudience string        `env:"JWT_AUDIENCE" envDefault:"clinks-web"`
	JWTTTL      time.Duration `env:"JWT_TTL" envDefault:"15m"`
}

type InviteConfig struct {
	PublicBaseURL string        `env:"INVITE_PUBLIC_BASE_URL" envDefault:"http://localhost:5174"`
	TTL           time.Duration `env:"INVITE_TTL" envDefault:"168h"`
	TokenSecret   string        `env:"INVITATION_TOKEN_SECRET,required"`
}

type SMTPConfig struct {
	Host       string `env:"SMTP_HOST"`
	Port       string `env:"SMTP_PORT" envDefault:"587"`
	Username   string `env:"SMTP_USERNAME"`
	Password   string `env:"SMTP_PASSWORD"`
	From       string `env:"SMTP_FROM"`
	RequireTLS bool   `env:"SMTP_REQUIRE_TLS" envDefault:"true"`
}

type OIDCConfig struct {
	GoogleClientID     string `env:"GOOGLE_OIDC_CLIENT_ID"`
	GoogleClientSecret string `env:"GOOGLE_OIDC_CLIENT_SECRET"`
	GoogleCallbackURL  string `env:"GOOGLE_OIDC_CALLBACK_URL"`
	StateSecret        string `env:"OIDC_STATE_SECRET"`
	SuccessURL         string `env:"OIDC_SUCCESS_URL"`
}

func (config OIDCConfig) Enabled() bool {
	return config.GoogleClientID != ""
}

type BootstrapConfig struct {
	Email    string `env:"ADMIN_EMAIL,required"`
	Password string `env:"ADMIN_PASSWORD,required"`
	Locale   string `env:"ADMIN_LOCALE" envDefault:"en-US"`
}

func (config *HTTPConfig) Address() string {
	return ":" + config.Port
}

func Load() (Config, error) {
	if err := loadDotEnv(); err != nil {
		return Config{}, err
	}

	var config Config
	if err := env.Parse(&config); err != nil {
		return Config{}, fmt.Errorf("parse environment configuration: %w", err)
	}
	if err := config.validate(); err != nil {
		return Config{}, fmt.Errorf("validate configuration: %w", err)
	}
	return config, nil
}

func (config *Config) validate() error {
	if config.Database.MinConns > config.Database.MaxConns {
		return errors.New("DATABASE_MIN_CONNS must not exceed DATABASE_MAX_CONNS")
	}
	if len(config.Auth.JWTSecret) < 32 || placeholder(config.Auth.JWTSecret) {
		return errors.New("JWT_SECRET must contain at least 32 non-placeholder characters")
	}
	if len(config.Bootstrap.Password) < 12 || placeholder(config.Bootstrap.Password) {
		return errors.New("ADMIN_PASSWORD must contain at least 12 non-placeholder characters")
	}
	if config.Invites.TTL < 0 {
		return errors.New("INVITE_TTL must not be negative")
	}
	if len(config.Invites.TokenSecret) < 32 || placeholder(config.Invites.TokenSecret) {
		return errors.New("INVITATION_TOKEN_SECRET must contain at least 32 non-placeholder characters")
	}
	if config.SMTP.Host != "" && (config.SMTP.From == "" || config.SMTP.Port == "") {
		return errors.New("SMTP_FROM and SMTP_PORT are required when SMTP_HOST is configured")
	}
	if config.OIDC.Enabled() && (config.OIDC.GoogleClientSecret == "" || config.OIDC.GoogleCallbackURL == "" || config.OIDC.SuccessURL == "" || len(config.OIDC.StateSecret) < 32 || placeholder(config.OIDC.StateSecret)) {
		return errors.New("GOOGLE_OIDC_CLIENT_SECRET, GOOGLE_OIDC_CALLBACK_URL, OIDC_STATE_SECRET and OIDC_SUCCESS_URL are required when GOOGLE_OIDC_CLIENT_ID is configured")
	}
	return nil
}

func loadDotEnv() error {
	for _, path := range []string{".env", "../.env"} {
		if err := godotenv.Load(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("load %s: %w", path, err)
		}
	}
	return nil
}

func placeholder(value string) bool {
	return strings.Contains(strings.ToLower(value), "replace-with")
}
