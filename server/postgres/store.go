package postgres

import "github.com/jackc/pgx/v5/pgxpool"

// Store owns PostgreSQL access for the application.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}
