package postgres

import (
	"fmt"

	"github.com/google/uuid"
)

func newUUID() (string, error) {
	value, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf(
			"generate UUIDv7: %w",
			err,
		)
	}

	return value.String(), nil
}
