package postgres

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type translationKey struct {
	locale domain.Locale
	scope  domain.ApplicationScope
}

type LocalizationRepository struct {
	pool *pgxpool.Pool

	cacheMu      sync.RWMutex
	translations map[translationKey][]domain.Translation
}

func NewLocalizationRepository(
	pool *pgxpool.Pool,
) *LocalizationRepository {
	return &LocalizationRepository{
		pool: pool,
		translations: make(
			map[translationKey][]domain.Translation,
		),
	}
}

func (repository *LocalizationRepository) ActiveLanguages(
	ctx context.Context,
) ([]domain.Language, error) {
	return repository.languages(
		ctx,
		true,
	)
}

func (repository *LocalizationRepository) AllLanguages(
	ctx context.Context,
) ([]domain.Language, error) {
	return repository.languages(
		ctx,
		false,
	)
}

func (repository *LocalizationRepository) Translations(
	ctx context.Context,
	locale domain.Locale,
	scope domain.ApplicationScope,
) ([]domain.Translation, error) {
	cacheKey := translationKey{
		locale: locale,
		scope:  scope,
	}

	if translations, found :=
		repository.cachedTranslations(cacheKey); found {
		return translations, nil
	}

	rows, err := repository.pool.Query(
		ctx,
		`
			SELECT
				locale,
				application_scope,
				key,
				value
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
		`,
		locale,
		scope,
		domain.ScopeShared,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"list translation overrides: %w",
				err,
			)
	}

	values, err := pgx.CollectRows(
		rows,
		func(
			row pgx.CollectableRow,
		) (domain.Translation, error) {
			var translation domain.Translation

			err := row.Scan(
				&translation.Locale,
				&translation.ApplicationScope,
				&translation.Key,
				&translation.Value,
			)

			return translation, err
		},
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"collect translation overrides: %w",
				err,
			)
	}

	merged := make(
		map[string]domain.Translation,
		len(values),
	)

	for _, translation := range values {
		merged[translation.Key] = translation
	}

	translations := make(
		[]domain.Translation,
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
			right domain.Translation,
		) int {
			return cmp.Compare(
				left.Key,
				right.Key,
			)
		},
	)

	repository.cacheTranslations(
		cacheKey,
		translations,
	)

	return slices.Clone(translations), nil
}

func (repository *LocalizationRepository) UpsertLanguage(
	ctx context.Context,
	language domain.Language,
	actorID domain.UserID,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			_, err := tx.Exec(
				ctx,
				`
					INSERT INTO languages (
						code,
						name,
						is_default,
						is_active
					)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (code)
					DO UPDATE SET
						name = EXCLUDED.name,
						is_default = EXCLUDED.is_default,
						is_active = EXCLUDED.is_active
				`,
				language.Code,
				language.Name,
				language.IsDefault,
				language.IsActive,
			)
			if err != nil {
				return fmt.Errorf(
					"upsert language: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID: new(actorID),
					Action:  "localization.language_saved",
					Target:  string(language.Code),
				},
			)
		},
	)
}

func (repository *LocalizationRepository) UpsertTranslationOverride(
	ctx context.Context,
	translation domain.Translation,
	actorID domain.UserID,
) error {
	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			_, err := tx.Exec(
				ctx,
				`
					INSERT INTO translation_overrides (
						locale,
						application_scope,
						key,
						value
					)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (
						locale,
						application_scope,
						key
					)
					DO UPDATE SET
						value = EXCLUDED.value
				`,
				translation.Locale,
				translation.ApplicationScope,
				translation.Key,
				translation.Value,
			)
			if err != nil {
				return fmt.Errorf(
					"upsert translation override: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID: new(actorID),
					Action:  "localization.translation_override_saved",
					Target:  translation.Key,
				},
			)
		},
	)
	if err != nil {
		return err
	}

	repository.invalidateTranslationCache(
		translation,
	)

	return nil
}

func (repository *LocalizationRepository) languages(
	ctx context.Context,
	activeOnly bool,
) ([]domain.Language, error) {
	query := `
		SELECT
			code,
			name,
			is_default,
			is_active
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

	rows, err := repository.pool.Query(
		ctx,
		query,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"list languages: %w",
				err,
			)
	}

	languages, err := pgx.CollectRows(
		rows,
		func(
			row pgx.CollectableRow,
		) (domain.Language, error) {
			var language domain.Language

			err := row.Scan(
				&language.Code,
				&language.Name,
				&language.IsDefault,
				&language.IsActive,
			)

			return language, err
		},
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"collect languages: %w",
				err,
			)
	}

	return languages, nil
}

func (repository *LocalizationRepository) cachedTranslations(
	key translationKey,
) ([]domain.Translation, bool) {
	repository.cacheMu.RLock()
	defer repository.cacheMu.RUnlock()

	translations, found :=
		repository.translations[key]

	if !found {
		return nil, false
	}

	return slices.Clone(translations), true
}

func (repository *LocalizationRepository) cacheTranslations(
	key translationKey,
	translations []domain.Translation,
) {
	repository.cacheMu.Lock()
	defer repository.cacheMu.Unlock()

	repository.translations[key] =
		slices.Clone(translations)
}

func (repository *LocalizationRepository) invalidateTranslationCache(
	translation domain.Translation,
) {
	repository.cacheMu.Lock()
	defer repository.cacheMu.Unlock()

	if translation.ApplicationScope ==
		domain.ScopeShared {
		for key := range repository.translations {
			if key.locale == translation.Locale {
				delete(
					repository.translations,
					key,
				)
			}
		}

		return
	}

	delete(
		repository.translations,
		translationKey{
			locale: translation.Locale,
			scope:  translation.ApplicationScope,
		},
	)
}
