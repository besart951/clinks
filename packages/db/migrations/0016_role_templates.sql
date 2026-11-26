-- Role templates per product (products.ts): a role made from a template remembers it, to be reset to it and hidden
-- while its product is not booked. Workspaces that already have Spitex or Physio get the templates now; the API adds
-- them whenever a product is booked later. Keep the values in step with `templates` in @clinks/domain/products.

ALTER TABLE roles ADD COLUMN template text;
CREATE UNIQUE INDEX roles_template ON roles (tenant_id, template) WHERE template IS NOT NULL;

INSERT INTO roles (id, tenant_id, name, kind, permissions, template)
SELECT gen_random_uuid(), t.id, v.name, 'custom', v.permissions, v.template
FROM tenants t
JOIN (VALUES
	('spitex', 'spitex.lead', 'Spitex-Leitung', ARRAY['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read', 'documents.write', 'planner.read', 'planner.write', 'spitex.read', 'spitex.write', 'spitex.release']::text[]),
	('spitex', 'spitex.planning', 'Spitex-Planung', ARRAY['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read', 'spitex.read', 'spitex.write', 'spitex.release']::text[]),
	('spitex', 'spitex.care', 'Spitex-Pflege', ARRAY['spitex.own.read']::text[]),
	('physio', 'physio.lead', 'Physio-Leitung', ARRAY['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read', 'documents.write', 'planner.read', 'planner.write', 'physio.read', 'physio.write']::text[]),
	('physio', 'physio.therapy', 'Physiotherapie', ARRAY['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read', 'documents.write', 'physio.read', 'physio.write']::text[]),
	('physio', 'physio.reception', 'Physio-Empfang', ARRAY['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read']::text[])
) AS v(module, template, name, permissions) ON v.module = ANY (t.enabled_modules)
ON CONFLICT DO NOTHING;
