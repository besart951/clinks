package postgres

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	clinks "github.com/besartmorina/clinks/server"
)

func constraintConflict(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		switch postgresError.Code {
		case "23503", "23505":
			return clinks.NewError(clinks.ErrorConflict)
		}
	}
	return err
}
