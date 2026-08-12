package clinks

const (
	DefaultPageSize = 20
	MaxPageSize     = 100
)

// Cursor is an opaque pagination token.
type Cursor string

type SortDirection string

const (
	SortAscending  SortDirection = "ascending"
	SortDescending SortDirection = "descending"
)

func (direction SortDirection) IsValid() bool {
	return direction == SortAscending || direction == SortDescending
}

// Page represents one cursor-based result page.
type Page[T any] struct {
	Items      []T
	NextCursor Cursor
}

type TenantSort string

const (
	TenantSortName      TenantSort = "name"
	TenantSortCreatedAt TenantSort = "created_at"
)

type TenantFilter struct {
	Search    string
	Sort      TenantSort
	Direction SortDirection
	Cursor    Cursor
	Limit     int
}

func (filter TenantFilter) Normalized() (TenantFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() {
		return TenantFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort TenantSort) IsValid() bool {
	return sort == TenantSortName || sort == TenantSortCreatedAt
}

type MembershipSort string

const (
	MembershipSortEmail     MembershipSort = "email"
	MembershipSortCreatedAt MembershipSort = "created_at"
)

type MembershipFilter struct {
	Search    string
	RoleID    *RoleID
	Status    *MembershipStatus
	Sort      MembershipSort
	Direction SortDirection
	Cursor    Cursor
	Limit     int
}

func (filter MembershipFilter) Normalized() (MembershipFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() ||
		filter.RoleID != nil && !filter.RoleID.IsValid() ||
		filter.Status != nil && !filter.Status.IsValid() {
		return MembershipFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort MembershipSort) IsValid() bool {
	return sort == MembershipSortEmail || sort == MembershipSortCreatedAt
}

type RoleSort string

const (
	RoleSortName      RoleSort = "name"
	RoleSortCreatedAt RoleSort = "created_at"
)

type RoleFilter struct {
	Search    string
	Kind      *RoleKind
	Sort      RoleSort
	Direction SortDirection
	Cursor    Cursor
	Limit     int
}

func (filter RoleFilter) Normalized() (RoleFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() ||
		filter.Kind != nil && !filter.Kind.IsValid() {
		return RoleFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort RoleSort) IsValid() bool {
	return sort == RoleSortName || sort == RoleSortCreatedAt
}

type LanguageSort string

const (
	LanguageSortName LanguageSort = "name"
	LanguageSortCode LanguageSort = "code"
)

type LanguageFilter struct {
	Search    string
	Active    *bool
	Sort      LanguageSort
	Direction SortDirection
	Cursor    Cursor
	Limit     int
}

func (filter LanguageFilter) Normalized() (LanguageFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() {
		return LanguageFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort LanguageSort) IsValid() bool {
	return sort == LanguageSortName || sort == LanguageSortCode
}

type TranslationSort string

const (
	TranslationSortKey       TranslationSort = "key"
	TranslationSortUpdatedAt TranslationSort = "updated_at"
)

type TranslationFilter struct {
	Search           string
	Locale           *Locale
	ApplicationScope *ApplicationScope
	Sort             TranslationSort
	Direction        SortDirection
	Cursor           Cursor
	Limit            int
}

func (filter TranslationFilter) Normalized() (TranslationFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() ||
		filter.Locale != nil && !filter.Locale.IsValid() ||
		filter.ApplicationScope != nil && !filter.ApplicationScope.IsValid() {
		return TranslationFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort TranslationSort) IsValid() bool {
	return sort == TranslationSortKey || sort == TranslationSortUpdatedAt
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
