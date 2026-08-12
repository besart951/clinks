package domain

type InvitationStatusFilter string

const (
	InvitationStatusFilterAll     InvitationStatusFilter = "all"
	InvitationStatusFilterPending InvitationStatusFilter = "pending"
	InvitationStatusFilterUsed    InvitationStatusFilter = "used"
	InvitationStatusFilterExpired InvitationStatusFilter = "expired"
	InvitationStatusFilterRevoked InvitationStatusFilter = "revoked"
)

type InvitationFilter struct {
	Search    string
	TenantID  *TenantID
	Status    InvitationStatusFilter
	Sort      InvitationSort
	Direction SortDirection
	Cursor    Cursor
	Limit     int
}

type InvitationSort string

const (
	InvitationSortCreatedAt InvitationSort = "created_at"
	InvitationSortEmail     InvitationSort = "email"
	InvitationSortExpiresAt InvitationSort = "expires_at"
)

func (status InvitationStatusFilter) IsValid() bool {
	switch status {
	case InvitationStatusFilterAll,
		InvitationStatusFilterPending,
		InvitationStatusFilterUsed,
		InvitationStatusFilterExpired,
		InvitationStatusFilterRevoked:
		return true

	default:
		return false
	}
}

func (filter InvitationFilter) Normalized() (InvitationFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() ||
		filter.TenantID != nil && !filter.TenantID.IsValid() {
		return InvitationFilter{}, NewError(ErrorValidation)
	}
	if filter.Status == "" {
		filter.Status = InvitationStatusFilterAll
	}
	if !filter.Status.IsValid() {
		return InvitationFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort InvitationSort) IsValid() bool {
	return sort == InvitationSortCreatedAt || sort == InvitationSortEmail || sort == InvitationSortExpiresAt
}
