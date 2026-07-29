// Package migrations embeds the PostgreSQL migration files.
package migrations

import "embed"

// Files contains the ordered SQL migrations applied at server startup.
//
//go:embed *.sql
var Files embed.FS
