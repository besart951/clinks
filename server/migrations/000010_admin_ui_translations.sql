INSERT INTO translation_overrides (locale, application_scope, key, value)
VALUES
    ('de-CH', 'shared', 'ui.search', 'Suchen …'),
    ('de-CH', 'shared', 'ui.reset', 'Zurücksetzen'),
    ('de-CH', 'shared', 'ui.status', 'Status'),
    ('de-CH', 'shared', 'ui.revoke', 'Widerrufen'),
    ('de-CH', 'shared', 'ui.user_id', 'Benutzer-ID'),
    ('de-CH', 'shared', 'ui.invitation_pending', 'Ausstehend'),
    ('de-CH', 'shared', 'ui.invitation_used', 'Verwendet'),
    ('de-CH', 'shared', 'ui.invitation_expired', 'Abgelaufen'),
    ('en-US', 'shared', 'ui.search', 'Search …'),
    ('en-US', 'shared', 'ui.reset', 'Reset'),
    ('en-US', 'shared', 'ui.status', 'Status'),
    ('en-US', 'shared', 'ui.revoke', 'Revoke'),
    ('en-US', 'shared', 'ui.user_id', 'User ID'),
    ('en-US', 'shared', 'ui.invitation_pending', 'Pending'),
    ('en-US', 'shared', 'ui.invitation_used', 'Used'),
    ('en-US', 'shared', 'ui.invitation_expired', 'Expired')
ON CONFLICT (locale, application_scope, key) DO NOTHING;
