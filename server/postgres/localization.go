package postgres

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) ActiveLanguages(
	ctx context.Context,
) ([]clinks.Language, error) {
	return store.languages(
		ctx,
		true,
	)
}

func (store *Store) AllLanguages(
	ctx context.Context,
) ([]clinks.Language, error) {
	return store.languages(
		ctx,
		false,
	)
}

func (store *Store) Translations(
	ctx context.Context,
	locale clinks.Locale,
	scope clinks.ApplicationScope,
) ([]clinks.Translation, error) {
	var values []clinks.Translation
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT
				locale,
				application_scope,
				key,
				value,
				revision
			FROM translation_overrides
			WHERE
				locale = $1
				AND application_scope IN ($2, $3)
			ORDER BY
				key,
				CASE
					WHEN application_scope = $3 THEN 0
					ELSE 1
				END
		`, locale, scope, clinks.ScopeShared)
		if err != nil {
			return fmt.Errorf("list translation overrides: %w", err)
		}
		values, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (clinks.Translation, error) {
			var translation clinks.Translation
			err := row.Scan(
				&translation.Locale,
				&translation.ApplicationScope,
				&translation.Key,
				&translation.Value,
				&translation.Revision,
			)
			return translation, err
		})
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("collect translation overrides: %w", err)
	}

	merged := make(
		map[string]clinks.Translation,
		len(values),
	)

	for _, translation := range values {
		merged[translation.Key] = translation
	}

	translations := make(
		[]clinks.Translation,
		0,
		len(merged),
	)

	for _, translation := range merged {
		translations = append(
			translations,
			translation,
		)
	}

	slices.SortFunc(
		translations,
		func(
			left,
			right clinks.Translation,
		) int {
			return cmp.Compare(
				left.Key,
				right.Key,
			)
		},
	)

	return translations, nil
}

func (store *Store) UpsertLanguage(
	ctx context.Context,
	language clinks.Language,
	actorID clinks.UserID,
) (clinks.Language, error) {
	err := withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			var err error
			if language.Revision == 0 {
				err = tx.QueryRow(ctx, `
					INSERT INTO languages (code, name, is_default, is_active)
					VALUES ($1, $2, $3, $4)
					RETURNING revision
				`, language.Code, language.Name, language.IsDefault, language.IsActive).Scan(&language.Revision)
			} else {
				err = tx.QueryRow(ctx, `
					UPDATE languages
					SET name = $2, is_active = $3, revision = revision + 1, updated_at = now()
					WHERE code = $1 AND revision = $4
					RETURNING revision
				`, language.Code, language.Name, language.IsActive, language.Revision).Scan(&language.Revision)
			}
			if err == pgx.ErrNoRows {
				return clinks.NewError(clinks.ErrorConflict)
			}
			if err != nil {
				return constraintConflict(fmt.Errorf(
					"upsert language: %w",
					err,
				))
			}

			return insertAuditEvent(
				ctx,
				tx,
				clinks.AuditEvent{
					ActorID: new(actorID),
					Action:  "localization.language_saved",
					Target:  string(language.Code),
				},
			)
		},
	)
	return language, err
}

func (store *Store) UpsertTranslationOverride(
	ctx context.Context,
	translation clinks.Translation,
	actorID clinks.UserID,
) (clinks.Translation, error) {
	err := withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			var err error
			if translation.Revision == 0 {
				err = tx.QueryRow(ctx, `
					INSERT INTO translation_overrides (locale, application_scope, key, value)
					VALUES ($1, $2, $3, $4)
					RETURNING revision
				`, translation.Locale, translation.ApplicationScope, translation.Key, translation.Value).Scan(&translation.Revision)
			} else {
				err = tx.QueryRow(ctx, `
					UPDATE translation_overrides
					SET value = $4, revision = revision + 1, updated_at = now()
					WHERE locale = $1 AND application_scope = $2 AND key = $3 AND revision = $5
					RETURNING revision
				`, translation.Locale, translation.ApplicationScope, translation.Key, translation.Value, translation.Revision).Scan(&translation.Revision)
			}
			if err == pgx.ErrNoRows {
				return clinks.NewError(clinks.ErrorConflict)
			}
			if err != nil {
				return constraintConflict(fmt.Errorf(
					"upsert translation override: %w",
					err,
				))
			}

			return insertAuditEvent(
				ctx,
				tx,
				clinks.AuditEvent{
					ActorID: new(actorID),
					Action:  "localization.translation_override_saved",
					Target:  translation.Key,
				},
			)
		},
	)
	if err != nil {
		return clinks.Translation{}, err
	}

	return translation, nil
}

func (store *Store) ListLanguages(
	ctx context.Context,
	filter clinks.LanguageFilter,
) (clinks.Page[clinks.Language], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), filter.Active, filter.Sort, filter.Direction)
	query := `SELECT code, name, is_default, is_active, revision, created_at, updated_at FROM languages WHERE TRUE`
	arguments := pgx.StrictNamedArgs{"limit": pageSize + 1}
	if search != "" {
		query += ` AND (name ILIKE '%' || @search || '%' OR code ILIKE '%' || @search || '%')`
		arguments["search"] = search
	}
	if filter.Active != nil {
		query += ` AND is_active = @active`
		arguments["active"] = *filter.Active
	}
	sortExpression := "name"
	if filter.Sort == clinks.LanguageSortCode {
		sortExpression = "code"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeKeysetCursor(filter.Cursor, "languages", fingerprint)
		if err != nil {
			return clinks.Page[clinks.Language]{}, clinks.NewError(clinks.ErrorValidation)
		}
		query += fmt.Sprintf(" AND (%s, code) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
		arguments["cursor_sort"] = cursor.SortValue
		arguments["cursor_id"] = cursor.ID
	}
	query += fmt.Sprintf(" ORDER BY %s %s, code %s LIMIT @limit", sortExpression, order, order)
	var page clinks.Page[clinks.Language]
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, arguments)
		if err != nil {
			return fmt.Errorf("list managed languages: %w", err)
		}
		page.Items, err = pgx.CollectRows(rows, scanLanguage)
		return err
	})
	if err != nil {
		return clinks.Page[clinks.Language]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := last.Name
		if filter.Sort == clinks.LanguageSortCode {
			sortValue = string(last.Code)
		}
		page.NextCursor = encodeKeysetCursor("languages", fingerprint, sortValue, string(last.Code))
	}
	return page, nil
}

func (store *Store) ListTranslationOverrides(
	ctx context.Context,
	filter clinks.TranslationFilter,
) (clinks.Page[clinks.Translation], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), optionalString(filter.Locale), optionalString(filter.ApplicationScope), filter.Sort, filter.Direction)
	query := `SELECT locale, application_scope, key, value, revision, created_at, updated_at FROM translation_overrides WHERE TRUE`
	arguments := pgx.StrictNamedArgs{"limit": pageSize + 1}
	if search != "" {
		query += ` AND key ILIKE '%' || @search || '%'`
		arguments["search"] = search
	}
	if filter.Locale != nil {
		query += ` AND locale = @locale`
		arguments["locale"] = *filter.Locale
	}
	if filter.ApplicationScope != nil {
		query += ` AND application_scope = @scope`
		arguments["scope"] = *filter.ApplicationScope
	}
	sortExpression := "key"
	if filter.Sort == clinks.TranslationSortUpdatedAt {
		sortExpression = "updated_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeKeysetCursor(filter.Cursor, "translation-overrides", fingerprint)
		if err != nil {
			return clinks.Page[clinks.Translation]{}, clinks.NewError(clinks.ErrorValidation)
		}
		parts := strings.Split(cursor.ID, "\x00")
		if len(parts) != 3 {
			return clinks.Page[clinks.Translation]{}, clinks.NewError(clinks.ErrorValidation)
		}
		if filter.Sort == clinks.TranslationSortUpdatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return clinks.Page[clinks.Translation]{}, clinks.NewError(clinks.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		arguments["cursor_locale"] = parts[0]
		arguments["cursor_scope"] = parts[1]
		arguments["cursor_key"] = parts[2]
		query += fmt.Sprintf(" AND (%s, locale, application_scope, key) %s (@cursor_sort, @cursor_locale, @cursor_scope, @cursor_key)", sortExpression, operator)
	}
	query += fmt.Sprintf(" ORDER BY %s %s, locale %s, application_scope %s, key %s LIMIT @limit", sortExpression, order, order, order, order)
	var page clinks.Page[clinks.Translation]
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, arguments)
		if err != nil {
			return fmt.Errorf("list translation overrides: %w", err)
		}
		page.Items, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (clinks.Translation, error) {
			var value clinks.Translation
			err := row.Scan(&value.Locale, &value.ApplicationScope, &value.Key, &value.Value, &value.Revision, &value.CreatedAt, &value.UpdatedAt)
			return value, err
		})
		return err
	})
	if err != nil {
		return clinks.Page[clinks.Translation]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := last.Key
		if filter.Sort == clinks.TranslationSortUpdatedAt {
			sortValue = last.UpdatedAt.UTC().Format(time.RFC3339Nano)
		}
		id := string(last.Locale) + "\x00" + string(last.ApplicationScope) + "\x00" + last.Key
		page.NextCursor = encodeKeysetCursor("translation-overrides", fingerprint, sortValue, id)
	}
	return page, nil
}

func (store *Store) DeleteTranslationOverride(
	ctx context.Context,
	translation clinks.Translation,
	actorID clinks.UserID,
) error {
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, `
			DELETE FROM translation_overrides
			WHERE locale = $1 AND application_scope = $2 AND key = $3 AND revision = $4
		`, translation.Locale, translation.ApplicationScope, translation.Key, translation.Revision)
		if err != nil {
			return fmt.Errorf("delete translation override: %w", err)
		}
		if result.RowsAffected() != 1 {
			return clinks.NewError(clinks.ErrorConflict)
		}
		return insertAuditEvent(ctx, tx, clinks.AuditEvent{
			ActorID: new(actorID), Action: "localization.translation_override_deleted", Target: translation.Key,
		})
	})
	return err
}

func (store *Store) languages(
	ctx context.Context,
	activeOnly bool,
) ([]clinks.Language, error) {
	query := `
		SELECT
			code,
			name,
			is_default,
			is_active,
			revision,
			created_at,
			updated_at
		FROM languages
	`

	if activeOnly {
		query += `
			WHERE is_active = TRUE
		`
	}

	query += `
		ORDER BY name, code
	`

	var languages []clinks.Language
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query)
		if err != nil {
			return fmt.Errorf("list languages: %w", err)
		}
		languages, err = pgx.CollectRows(rows, scanLanguage)
		return err
	})
	if err != nil {
		return nil,
			fmt.Errorf(
				"collect languages: %w",
				err,
			)
	}

	return languages, nil
}

func scanLanguage(row pgx.CollectableRow) (clinks.Language, error) {
	var language clinks.Language
	err := row.Scan(
		&language.Code,
		&language.Name,
		&language.IsDefault,
		&language.IsActive,
		&language.Revision,
		&language.CreatedAt,
		&language.UpdatedAt,
	)
	return language, err
}
