package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const minimumInvitationTokenSecretBytes = 32

type InvitationTokenConfig struct {
	Secret string
}

type InvitationTokenSigner struct {
	secret []byte
}

func NewInvitationTokenSigner(
	config InvitationTokenConfig,
) (*InvitationTokenSigner, error) {
	if len(config.Secret) < minimumInvitationTokenSecretBytes {
		return nil, fmt.Errorf(
			"invitation token secret must contain at least %d bytes",
			minimumInvitationTokenSecretBytes,
		)
	}

	return &InvitationTokenSigner{
		secret: []byte(config.Secret),
	}, nil
}

func (signer *InvitationTokenSigner) NewInvitationID() (
	domain.InvitationID,
	error,
) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("generate invitation id: %w", err)
	}

	return domain.InvitationID(id.String()), nil
}

func (signer *InvitationTokenSigner) Token(
	invitation domain.Invitation,
) (string, error) {
	if !invitation.ID.IsValid() {
		return "", errors.New(
			"sign invitation token: invitation id is required",
		)
	}

	if invitation.ExpiresAt.IsZero() {
		return "", errors.New(
			"sign invitation token: invitation expiry is required",
		)
	}

	payload := string(invitation.ID) +
		"." +
		strconv.FormatInt(invitation.ExpiresAt.Unix(), 10)

	mac := hmac.New(sha256.New, signer.secret)
	_, _ = mac.Write([]byte(payload))

	signature := base64.RawURLEncoding.EncodeToString(
		mac.Sum(nil),
	)

	return payload + "." + signature, nil
}
