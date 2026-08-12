package domain

const (
	DefaultPageSize = 20
	MaxPageSize     = 100
)

// Cursor is an opaque pagination token.
type Cursor string

// Page represents one cursor-based result page.
type Page[T any] struct {
	Items      []T
	NextCursor Cursor
}

func EffectiveLimit(limit int) int {
	switch {
	case limit <= 0:
		return DefaultPageSize

	case limit > MaxPageSize:
		return MaxPageSize

	default:
		return limit
	}
}
