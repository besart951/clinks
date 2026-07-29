INSERT INTO translations (locale, key, value)
VALUES
    ('de-CH', 'ui.theme', 'Darstellung'),
    ('de-CH', 'ui.theme_system', 'System'),
    ('de-CH', 'ui.theme_light', 'Hell'),
    ('de-CH', 'ui.theme_dark', 'Dunkel'),
    ('de-CH', 'ui.welcome', 'Willkommen'),
    ('de-CH', 'ui.connected_to_tenant', 'ist mit dem Mandanten verbunden.'),
    ('de-CH', 'ui.locale', 'Gebietsschema'),
    ('de-CH', 'ui.default', 'Standard'),
    ('en-US', 'ui.theme', 'Theme'),
    ('en-US', 'ui.theme_system', 'System'),
    ('en-US', 'ui.theme_light', 'Light'),
    ('en-US', 'ui.theme_dark', 'Dark'),
    ('en-US', 'ui.welcome', 'Welcome'),
    ('en-US', 'ui.connected_to_tenant', 'is connected to the tenant.'),
    ('en-US', 'ui.locale', 'Locale'),
    ('en-US', 'ui.default', 'Default')
ON CONFLICT (locale, key) DO NOTHING;
