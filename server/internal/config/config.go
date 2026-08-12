// Package config loads process configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"net"
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

type Profile string

const (
	ProfileAPI               Profile = "api"
	ProfileMigration         Profile = "migration"
	ProfileHealthcheck       Profile = "healthcheck"
	ProfileWorker            Profile = "worker"
	ProfileWorkerHealthcheck Profile = "worker-healthcheck"
)

type HTTPConfig struct {
	Port                string   `env:"SERVER_PORT" envDefault:"8080"`
	CORSOrigins         []string `env:"CORS_ORIGINS" envDefault:"http://localhost:5173,http://localhost:5174,http://localhost:5175" envSeparator:","`
	SessionCookieName   string   `env:"SESSION_COOKIE_NAME" envDefault:"clinks_session"`
	SessionCookieSecure bool     `env:"SESSION_COOKIE_SECURE" envDefault:"false"`
	SessionCookieDomain string   `env:"SESSION_COOKIE_DOMAIN"`
}

func (config *HTTPConfig) Address() string {
	return net.JoinHostPort("", config.Port)
}

type DatabaseConfig struct {
	URL             string        `env:"DATABASE_URL"`
	MaxConns        int32         `env:"DATABASE_MAX_CONNS" envDefault:"20"`
	MinConns        int32         `env:"DATABASE_MIN_CONNS" envDefault:"2"`
	ConnMaxLifetime time.Duration `env:"DATABASE_CONN_MAX_LIFETIME" envDefault:"1h"`
	ConnMaxIdleTime time.Duration `env:"DATABASE_CONN_MAX_IDLE_TIME" envDefault:"30m"`
	HealthCheck     time.Duration `env:"DATABASE_HEALTH_CHECK_PERIOD" envDefault:"1m"`
}

type AuthConfig struct {
	JWTSecret   string        `env:"JWT_SECRET"`
	JWTIssuer   string        `env:"JWT_ISSUER" envDefault:"clinks"`
	JWTAudience string        `env:"JWT_AUDIENCE" envDefault:"clinks-web"`
	JWTTTL      time.Duration `env:"JWT_TTL" envDefault:"15m"`
}

type InviteConfig struct {
	PublicBaseURL string        `env:"INVITE_PUBLIC_BASE_URL" envDefault:"http://localhost:5174"`
	TTL           time.Duration `env:"INVITE_TTL" envDefault:"168h"`
	TokenSecret   string        `env:"INVITATION_TOKEN_SECRET"`
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

func (config *OIDCConfig) Enabled() bool {
	return config.GoogleClientID != ""
}

type BootstrapConfig struct {
	Email    string `env:"ADMIN_EMAIL"`
	Password string `env:"ADMIN_PASSWORD"`
	Locale   string `env:"ADMIN_LOCALE" envDefault:"en-US"`
}

func Load(profile Profile) (Config, error) {
	if err := loadDotEnv(); err != nil {
		return Config{}, err
	}

	var config Config
	if err := env.Parse(&config); err != nil {
		return Config{}, fmt.Errorf("parse environment configuration: %w", err)
	}

	if err := config.validate(profile); err != nil {
		return Config{}, fmt.Errorf("validate configuration: %w", err)
	}

	return config, nil
}

func (config *Config) validate(profile Profile) error {
	var errs []error

	if strings.TrimSpace(config.Database.URL) == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if config.Database.MaxConns <= 0 {
		errs = append(errs, errors.New("DATABASE_MAX_CONNS must be greater than 0"))
	}
	if config.Database.MinConns < 0 {
		errs = append(errs, errors.New("DATABASE_MIN_CONNS must not be negative"))
	}
	if config.Database.MinConns > config.Database.MaxConns {
		errs = append(errs, errors.New("DATABASE_MIN_CONNS must not exceed DATABASE_MAX_CONNS"))
	}

	switch profile {
	case ProfileAPI:
		errs = append(errs, config.validateAuth(), config.validateInvites(), config.validateOIDC())
	case ProfileMigration:
		errs = append(errs, config.validateBootstrap())
	case ProfileWorker:
		errs = append(errs, config.validateInvites(), config.validateSMTP())
	case ProfileHealthcheck, ProfileWorkerHealthcheck:
	case "":
		errs = append(errs, errors.New("configuration profile is required"))
	default:
		errs = append(errs, fmt.Errorf("unknown configuration profile %q", profile))
	}

	return errors.Join(errs...)
}

func (config *Config) validateAuth() error {
	var errs []error
	if len(config.Auth.JWTSecret) < 32 || placeholder(config.Auth.JWTSecret) {
		errs = append(errs, errors.New("JWT_SECRET must contain at least 32 non-placeholder characters"))
	}
	if config.Auth.JWTTTL <= 0 {
		errs = append(errs, errors.New("JWT_TTL must be greater than 0"))
	}
	return errors.Join(errs...)
}

func (config *Config) validateInvites() error {
	var errs []error
	if len(config.Invites.TokenSecret) < 32 || placeholder(config.Invites.TokenSecret) {
		errs = append(errs, errors.New("INVITATION_TOKEN_SECRET must contain at least 32 non-placeholder characters"))
	}
	if config.Invites.TTL <= 0 {
		errs = append(errs, errors.New("INVITE_TTL must be greater than 0"))
	}
	return errors.Join(errs...)
}

func (config *Config) validateBootstrap() error {
	var errs []error
	if strings.TrimSpace(config.Bootstrap.Email) == "" {
		errs = append(errs, errors.New("ADMIN_EMAIL is required"))
	}
	if len(config.Bootstrap.Password) < 12 || placeholder(config.Bootstrap.Password) {
		errs = append(errs, errors.New("ADMIN_PASSWORD must contain at least 12 non-placeholder characters"))
	}
	return errors.Join(errs...)
}

func (config *Config) validateSMTP() error {
	if strings.TrimSpace(config.SMTP.Host) == "" ||
		strings.TrimSpace(config.SMTP.From) == "" ||
		strings.TrimSpace(config.SMTP.Port) == "" {
		return errors.New("SMTP_HOST, SMTP_FROM, and SMTP_PORT are required for the worker")
	}
	return nil
}

func (config *Config) validateOIDC() error {
	if !config.OIDC.Enabled() {
		return nil
	}
	if config.OIDC.GoogleClientSecret == "" ||
		config.OIDC.GoogleCallbackURL == "" ||
		config.OIDC.SuccessURL == "" ||
		len(config.OIDC.StateSecret) < 32 ||
		placeholder(config.OIDC.StateSecret) {
		return errors.New("GOOGLE_OIDC_CLIENT_SECRET, GOOGLE_OIDC_CALLBACK_URL, OIDC_SUCCESS_URL, and OIDC_STATE_SECRET (min 32 chars) are required when GOOGLE_OIDC_CLIENT_ID is configured")
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
	lower := strings.ToLower(value)
	for _, sub := range []string{"replace-with", "change-me", "your-secret-here"} {
		if strings.Contains(lower, sub) {
			return true
		}
	}
	return false
}
