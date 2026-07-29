package postgres

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type LocalizationRepository struct {
	pool         *pgxpool.Pool
	cacheMu      sync.RWMutex
	translations map[translationKey][]domain.Translation
}

type translationKey struct {
	locale domain.Locale
	scope  domain.ApplicationScope
}

func NewLocalizationRepository(pool *pgxpool.Pool) *LocalizationRepository {
	return &LocalizationRepository{pool: pool, translations: make(map[translationKey][]domain.Translation)}
}

func (repository *LocalizationRepository) ActiveLanguages(ctx context.Context) ([]domain.Language, error) {
	return repository.languages(ctx, "WHERE is_active = TRUE")
}

func (repository *LocalizationRepository) AllLanguages(ctx context.Context) ([]domain.Language, error) {
	return repository.languages(ctx, "")
}

func (repository *LocalizationRepository) Translations(ctx context.Context, locale domain.Locale, scope domain.ApplicationScope) ([]domain.Translation, error) {
	cacheKey := translationKey{locale: locale, scope: scope}
	if translations, found := repository.cachedTranslations(cacheKey); found {
		return translations, nil
	}
	rows, err := repository.pool.Query(ctx, `SELECT locale, application_scope, key, value FROM translation_overrides
		WHERE locale = $1 AND application_scope IN ($2, 'shared')
		ORDER BY key, CASE WHEN application_scope = 'shared' THEN 0 ELSE 1 END`, locale, scope)
	if err != nil {
		return nil, fmt.Errorf("list translations: %w", err)
	}
	defer rows.Close()
	merged := make(map[string]domain.Translation)
	for rows.Next() {
		var translation domain.Translation
		if err = rows.Scan(&translation.Locale, &translation.ApplicationScope, &translation.Key, &translation.Value); err != nil {
			return nil, fmt.Errorf("scan translation: %w", err)
		}
		merged[translation.Key] = translation
	}
	if rowErr := rows.Err(); rowErr != nil {
		return nil, rowErr
	}
	translations := make([]domain.Translation, 0, len(merged))
	for _, translation := range merged {
		translations = append(translations, translation)
	}
	sortTranslationsByKey(translations)
	repository.cacheTranslations(cacheKey, translations)
	return translations, nil
}

func sortTranslationsByKey(translations []domain.Translation) {
	for index := 1; index < len(translations); index++ {
		for position := index; position > 0 && translations[position].Key < translations[position-1].Key; position-- {
			translations[position], translations[position-1] = translations[position-1], translations[position]
		}
	}
}

func (repository *LocalizationRepository) UpsertLanguage(ctx context.Context, language domain.Language, actor domain.UserID) error {
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO languages (code, name, is_default, is_active) VALUES ($1, $2, $3, $4)
			ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active`, language.Code, language.Name, language.IsDefault, language.IsActive)
		if err != nil {
			return fmt.Errorf("upsert language: %w", err)
		}
		event := domain.AuditEvent{ActorID: &actor, Action: "localization.language_saved", Target: string(language.Code)}
		return insertAuditEvent(ctx, tx, &event)
	})
	if err == nil {
		repository.clearCache()
	}
	return err
}

func (repository *LocalizationRepository) UpsertTranslationOverride(ctx context.Context, translation domain.Translation, actor domain.UserID) error {
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO translation_overrides (locale, application_scope, key, value) VALUES ($1, $2, $3, $4)
			ON CONFLICT (locale, application_scope, key) DO UPDATE SET value = EXCLUDED.value`, translation.Locale, translation.ApplicationScope, translation.Key, translation.Value)
		if err != nil {
			return fmt.Errorf("upsert translation override: %w", err)
		}
		event := domain.AuditEvent{ActorID: &actor, Action: "localization.translation_override_saved", Target: translation.Key}
		return insertAuditEvent(ctx, tx, &event)
	})
	if err == nil {
		repository.clearCache()
	}
	return err
}

func (repository *LocalizationRepository) clearCache() {
	repository.cacheMu.Lock()
	defer repository.cacheMu.Unlock()
	clear(repository.translations)
}

func (repository *LocalizationRepository) cachedTranslations(cacheKey translationKey) ([]domain.Translation, bool) {
	repository.cacheMu.RLock()
	defer repository.cacheMu.RUnlock()
	translations, found := repository.translations[cacheKey]
	return append([]domain.Translation(nil), translations...), found
}

func (repository *LocalizationRepository) cacheTranslations(cacheKey translationKey, translations []domain.Translation) {
	repository.cacheMu.Lock()
	defer repository.cacheMu.Unlock()
	repository.translations[cacheKey] = append([]domain.Translation(nil), translations...)
}

func (repository *LocalizationRepository) languages(ctx context.Context, filter string) ([]domain.Language, error) {
	rows, err := repository.pool.Query(ctx, `SELECT code, name, is_default, is_active FROM languages `+filter+` ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list languages: %w", err)
	}
	defer rows.Close()
	languages := make([]domain.Language, 0)
	for rows.Next() {
		var language domain.Language
		if err = rows.Scan(&language.Code, &language.Name, &language.IsDefault, &language.IsActive); err != nil {
			return nil, fmt.Errorf("scan language: %w", err)
		}
		languages = append(languages, language)
	}
	return languages, rows.Err()
}
