package domain

type InvitationStatusFilter string

const (
	InvitationStatusFilterAll     InvitationStatusFilter = "all"
	InvitationStatusFilterPending InvitationStatusFilter = "pending"
	InvitationStatusFilterUsed    InvitationStatusFilter = "used"
	InvitationStatusFilterExpired InvitationStatusFilter = "expired"
)

type InvitationFilter struct {
	Search   string
	TenantID *TenantID
	Status   InvitationStatusFilter
	Cursor   Cursor
	Limit    int
}

func (status InvitationStatusFilter) IsValid() bool {
	switch status {
	case InvitationStatusFilterAll,
		InvitationStatusFilterPending,
		InvitationStatusFilterUsed,
		InvitationStatusFilterExpired:
		return true

	default:
		return false
	}
}
