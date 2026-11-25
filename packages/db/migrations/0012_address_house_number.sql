-- Addresses keep the house number apart from the street («Bahnhofstrasse» + «57»), as the QR bill's structured
-- address does. Existing streets that end in a number are split; the rest keep an empty house number.
CREATE FUNCTION pg_temp.split_house_number(address jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
	SELECT address || CASE
		WHEN address->>'street' ~* '^.*\S\s+\d+\s?[a-z]?([-/]\d+[a-z]?)?$' THEN jsonb_build_object(
			'street', substring(address->>'street' from '(?i)^(.*\S)\s+\d+\s?[a-z]?(?:[-/]\d+[a-z]?)?$'),
			'houseNumber', replace(substring(address->>'street' from '(?i)\s(\d+\s?[a-z]?(?:[-/]\d+[a-z]?)?)$'), ' ', '')
		)
		ELSE jsonb_build_object('houseNumber', '')
	END
$$;

-- Every tenant's rows: the owner steps outside the forced policies for this transaction only.
ALTER TABLE contacts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
UPDATE contacts SET address = pg_temp.split_house_number(address) WHERE NOT address ? 'houseNumber';
UPDATE tenants SET address = pg_temp.split_house_number(address) WHERE NOT address ? 'houseNumber';
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE contacts ALTER COLUMN address SET DEFAULT '{"street":"","houseNumber":"","zip":"","city":""}';
ALTER TABLE tenants ALTER COLUMN address SET DEFAULT '{"street":"","houseNumber":"","zip":"","city":""}';
