package domain

// Cursor is an opaque pagination token returned by cursor-based list queries.
type Cursor string

// Page holds a slice of items and an optional cursor for the next page.
type Page[T any] struct {
	Items      []T
	NextCursor Cursor
}

// DefaultPageSize is used when a caller does not specify a limit.
const DefaultPageSize = 20

// EffectiveLimit returns limit clamped to [1, 100]. Zero means DefaultPageSize.
func EffectiveLimit(limit int) int {
	switch {
	case limit <= 0:
		return DefaultPageSize
	case limit > 100:
		return 100
	default:
		return limit
	}
}
