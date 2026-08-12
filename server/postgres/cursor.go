package postgres

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	clinks "github.com/besartmorina/clinks/server"
)

type keysetCursor struct {
	Version     int    `json:"v"`
	Kind        string `json:"kind"`
	Fingerprint string `json:"filter"`
	SortValue   string `json:"sort_value"`
	ID          string `json:"id"`
}

func decodeUUIDKeysetCursor(
	cursor clinks.Cursor,
	kind,
	fingerprint string,
) (keysetCursor, error) {
	decoded, err := decodeKeysetCursor(cursor, kind, fingerprint)
	if err != nil {
		return keysetCursor{}, err
	}
	if err := uuid.Validate(strings.ToLower(decoded.ID)); err != nil {
		return keysetCursor{}, fmt.Errorf("invalid %s cursor ID: %w", kind, err)
	}
	return decoded, nil
}

func encodeKeysetCursor(kind, fingerprint, sortValue, id string) clinks.Cursor {
	value, err := json.Marshal(keysetCursor{
		Version: 1, Kind: kind, Fingerprint: fingerprint, SortValue: sortValue, ID: id,
	})
	if err != nil {
		panic("marshal keyset cursor: " + err.Error())
	}
	return clinks.Cursor(base64.RawURLEncoding.EncodeToString(value))
}

func decodeKeysetCursor(cursor clinks.Cursor, kind, fingerprint string) (keysetCursor, error) {
	value, err := base64.RawURLEncoding.DecodeString(string(cursor))
	if err != nil {
		return keysetCursor{}, err
	}
	var decoded keysetCursor
	if err := json.Unmarshal(value, &decoded); err != nil {
		return keysetCursor{}, err
	}
	if decoded.Version != 1 || decoded.Kind != kind || decoded.Fingerprint != fingerprint || decoded.SortValue == "" || decoded.ID == "" {
		return keysetCursor{}, fmt.Errorf("invalid %s cursor", kind)
	}
	return decoded, nil
}

func keysetFingerprint(values ...any) string {
	encoded, err := json.Marshal(values)
	if err != nil {
		panic("marshal cursor fingerprint: " + err.Error())
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:16])
}

func optionalString[T ~string](value *T) string {
	if value == nil {
		return ""
	}
	return string(*value)
}

func keysetDirection(direction clinks.SortDirection) (operator, order string) {
	if direction == clinks.SortDescending {
		return "<", "DESC"
	}
	return ">", "ASC"
}
