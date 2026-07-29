package postgres

import "testing"

func TestMigrationChecksumDetectsContentChanges(t *testing.T) {
	if migrationChecksum([]byte("SELECT 1;")) == migrationChecksum([]byte("SELECT 2;")) {
		t.Fatal("expected distinct checksums for distinct migrations")
	}
}
