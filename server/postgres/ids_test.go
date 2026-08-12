package postgres

import (
	"testing"

	"github.com/google/uuid"
)

func TestNewUUIDUsesVersion7(t *testing.T) {
	value, err := newUUID()
	if err != nil {
		t.Fatalf("newUUID() error = %v", err)
	}
	parsed, err := uuid.Parse(value)
	if err != nil {
		t.Fatalf("uuid.Parse() error = %v", err)
	}
	if parsed.Version() != 7 {
		t.Fatalf("UUID version = %d, want 7", parsed.Version())
	}
}
