package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) ListUsers(
	ctx context.Context,
	filter clinks.UserFilter,
) (clinks.Page[clinks.UserSummary], error) {
	var page clinks.Page[clinks.UserSummary]

	err := withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			var err error
			page, err = listUsersTx(
				ctx,
				tx,
				filter,
			)

			return err
		},
	)

	return page, err
}

func (store *Store) GetUser(
	ctx context.Context,
	userID clinks.UserID,
) (clinks.UserDetail, error) {
	var detail clinks.UserDetail

	err := withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			user, err := scanUser(
				ctx,
				tx,
				userID,
			)
			if err != nil {
				return err
			}

			memberships, err := listUserMemberships(
				ctx,
				tx,
				userID,
			)
			if err != nil {
				return err
			}

			detail = clinks.UserDetail{
				User:        user,
				Memberships: memberships,
			}

			return nil
		},
	)

	return detail, err
}

func listUsersTx(
	ctx context.Context,
	tx pgx.Tx,
	filter clinks.UserFilter,
) (clinks.Page[clinks.UserSummary], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
	queryLimit := pageSize + 1

	query := `
		SELECT
			users.id,
			users.email,
			users.locale,
			users.global_role,
			(
				SELECT COUNT(*)
				FROM tenant_memberships membership
				WHERE
					membership.user_id = users.id
					AND membership.status = @active_status
			) AS membership_count
			, users.created_at
		FROM users
		WHERE TRUE
	`

	arguments := pgx.StrictNamedArgs{
		"active_status": clinks.MembershipActive,
		"limit":         queryLimit,
	}

	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), optionalString(filter.GlobalRole), filter.Sort, filter.Direction)
	if search != "" {
		query += `
			AND users.email ILIKE '%' || @search || '%'
		`
		arguments["search"] = search
	}

	if filter.GlobalRole != nil {
		query += `
			AND users.global_role = @global_role
		`
		arguments["global_role"] = *filter.GlobalRole
	}

	sortExpression := "users.email"
	if filter.Sort == clinks.UserSortCreatedAt {
		sortExpression = "users.created_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "users", fingerprint)
		if err != nil {
			return clinks.Page[clinks.UserSummary]{}, clinks.NewError(clinks.ErrorValidation)
		}
		query += fmt.Sprintf(" AND (%s, users.id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
		if filter.Sort == clinks.UserSortCreatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return clinks.Page[clinks.UserSummary]{}, clinks.NewError(clinks.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		arguments["cursor_id"] = cursor.ID
	}

	query += fmt.Sprintf(" ORDER BY %s %s, users.id %s LIMIT @limit", sortExpression, order, order)

	rows, err := tx.Query(
		ctx,
		query,
		arguments,
	)
	if err != nil {
		return clinks.Page[clinks.UserSummary]{},
			fmt.Errorf("list users: %w", err)
	}

	items, err := pgx.CollectRows(
		rows,
		scanUserSummary,
	)
	if err != nil {
		return clinks.Page[clinks.UserSummary]{},
			fmt.Errorf(
				"collect user summaries: %w",
				err,
			)
	}

	page := clinks.Page[clinks.UserSummary]{
		Items: items,
	}

	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]

		last := page.Items[len(page.Items)-1]
		sortValue := string(last.Email)
		if filter.Sort == clinks.UserSortCreatedAt {
			sortValue = last.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("users", fingerprint, sortValue, string(last.ID))
	}

	return page, nil
}

func scanUserSummary(
	row pgx.CollectableRow,
) (clinks.UserSummary, error) {
	var summary clinks.UserSummary
	var membershipCount int64

	err := row.Scan(
		&summary.ID,
		&summary.Email,
		&summary.Locale,
		&summary.GlobalRole,
		&membershipCount,
		&summary.CreatedAt,
	)
	if err != nil {
		return clinks.UserSummary{}, err
	}

	summary.MembershipCount = int(membershipCount)

	return summary, nil
}

func scanUser(
	ctx context.Context,
	tx pgx.Tx,
	userID clinks.UserID,
) (clinks.User, error) {
	var user clinks.User

	err := tx.QueryRow(
		ctx,
		`
			SELECT
				id,
				email,
				global_role,
				locale,
				session_version
			FROM users
			WHERE id = $1
		`,
		userID,
	).Scan(
		&user.ID,
		&user.Email,
		&user.GlobalRole,
		&user.Locale,
		&user.SessionVersion,
	)

	if err == pgx.ErrNoRows {
		return clinks.User{},
			clinks.NewError(clinks.ErrorUserNotFound)
	}

	if err != nil {
		return clinks.User{},
			fmt.Errorf("find user: %w", err)
	}

	return user, nil
}

func listUserMemberships(
	ctx context.Context,
	tx pgx.Tx,
	userID clinks.UserID,
) ([]clinks.Membership, error) {
	rows, err := tx.Query(
		ctx,
		membershipQuery+`
			WHERE
				membership.user_id = $1
				AND membership.status = $2
			ORDER BY tenant.name, membership.id
		`,
		userID,
		clinks.MembershipActive,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"list user memberships: %w",
				err,
			)
	}

	memberships, err := pgx.CollectRows(
		rows,
		scanMembership,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"collect user memberships: %w",
				err,
			)
	}

	return memberships, nil
}
