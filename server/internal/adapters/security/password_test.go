package security

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestPasswordHasherHashAndVerify(t *testing.T) {
	hasher := NewPasswordHasherWithCost(bcrypt.MinCost)
	hash, err := hasher.Hash("correct horse battery staple")
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	if !hasher.Verify("correct horse battery staple", hash) {
		t.Error("Verify() returned false for the matching password")
	}
	if hasher.Verify("wrong password", hash) {
		t.Error("Verify() returned true for a non-matching password")
	}
}

func TestPasswordHasherRejectsEmptyHash(t *testing.T) {
	hasher := NewPasswordHasherWithCost(bcrypt.MinCost)
	if hasher.Verify("any password", "") {
		t.Error("Verify() returned true for an empty hash")
	}
}

func TestRejectedPasswordHashUsesDefaultCost(t *testing.T) {
	cost, err := bcrypt.Cost([]byte(rejectedPasswordHash))
	if err != nil {
		t.Fatalf("bcrypt.Cost() error = %v", err)
	}
	if cost != bcrypt.DefaultCost {
		t.Errorf("fallback hash cost = %d, want %d", cost, bcrypt.DefaultCost)
	}
}
