package postgres

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func constraintConflict(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		switch postgresError.Code {
		case "23503", "23505":
			return domain.NewError(domain.ErrorConflict)
		}
	}
	return err
}
