package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type InvitationTokenSigner struct {
	secret []byte
}

type InvitationTokenConfig struct {
	Secret string
}

func NewInvitationTokenSigner(config InvitationTokenConfig) (*InvitationTokenSigner, error) {
	if len(config.Secret) < 32 {
		return nil, fmt.Errorf("invitation token secret must contain at least 32 characters")
	}
	return &InvitationTokenSigner{secret: []byte(config.Secret)}, nil
}

func (signer *InvitationTokenSigner) NewInvitationID() (domain.InvitationID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("generate invitation id: %w", err)
	}
	return domain.InvitationID(id.String()), nil
}

func (signer *InvitationTokenSigner) Token(invitation *domain.Invitation) (string, error) {
	if invitation.ID == "" || invitation.ExpiresAt.IsZero() {
		return "", fmt.Errorf("sign invitation token: invitation id and expiry are required")
	}
	payload := string(invitation.ID) + "." + strconv.FormatInt(invitation.ExpiresAt.UTC().Unix(), 10)
	mac := hmac.New(sha256.New, signer.secret)
	if _, err := mac.Write([]byte(payload)); err != nil {
		return "", fmt.Errorf("sign invitation token: %w", err)
	}
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
