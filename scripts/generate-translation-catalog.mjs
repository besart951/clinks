import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "localization/product-catalog.json");
const typeOutputPath = join(root, "packages/i18n-types/src/product-translation-key.generated.ts");
const goOutputPath = join(root, "server/internal/adapters/localization/product_catalog.generated.go");
const validScopes = new Map([
	["shared", "ScopeShared"],
	["admin", "ScopeAdmin"],
	["planer_link", "ScopePlanerLink"],
	["infra_link", "ScopeInfraLink"]
]);

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const entries = validateCatalog(catalog);
const typeOutput = renderTypeScript(catalog.defaultLocale, entries);
const goOutput = renderGo(catalog.defaultLocale, entries);
const migration = process.argv.find((argument) => argument.startsWith("--migration="));

if (process.argv.includes("--check")) {
	await verifyOutput(typeOutputPath, typeOutput);
	await verifyOutput(goOutputPath, goOutput);
	process.exit(0);
}

await writeFile(typeOutputPath, typeOutput);
await writeFile(goOutputPath, goOutput);

if (migration) {
	const filename = migration.slice("--migration=".length);
	if (!/^\d{6}_[a-z0-9_]+\.sql$/.test(filename)) fail(`Invalid migration filename: ${filename}`);
	const migrationPath = join(root, "server/migrations", filename);
	try {
		await access(migrationPath);
		fail(`Migration already exists and is immutable: ${filename}`);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	await writeFile(migrationPath, renderTransitionMigration(entries));
}

function validateCatalog(value) {
	if (!value || typeof value !== "object") fail("Catalog must be an object.");
	if (value.defaultLocale !== "de-CH") fail("The product default locale must be de-CH.");
	if (!value.translations || typeof value.translations !== "object") fail("Catalog translations must be an object.");

	const entries = [];
	const seen = new Set();
	for (const [scope, scopedTranslations] of Object.entries(value.translations)) {
		if (!validScopes.has(scope)) fail(`Unsupported application scope: ${scope}`);
		if (!scopedTranslations || typeof scopedTranslations !== "object") fail(`Translations for ${scope} must be an object.`);
		for (const [key, localizedValues] of Object.entries(scopedTranslations)) {
			if (!/^(audit|error|ui)\.[a-z_]+(?:\.[a-z_]+)*$/.test(key)) fail(`Invalid translation key: ${key}`);
			const identity = `${scope}:${key}`;
			if (seen.has(identity)) fail(`Duplicate translation key: ${identity}`);
			seen.add(identity);
			if (!localizedValues || typeof localizedValues !== "object") fail(`Translations for ${identity} must be an object.`);
			const defaultValue = localizedValues[value.defaultLocale];
			if (typeof defaultValue !== "string" || defaultValue.trim() === "") fail(`Missing ${value.defaultLocale} text for ${identity}.`);
			if (defaultValue.includes("ß")) fail(`Use Swiss spelling with ss, not ß: ${identity}`);
			const defaultPlaceholders = placeholders(defaultValue);
			for (const [locale, translation] of Object.entries(localizedValues)) {
				if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) fail(`Invalid locale ${locale} for ${identity}.`);
				if (typeof translation !== "string" || translation.trim() === "") fail(`Empty ${locale} text for ${identity}.`);
				if (locale === value.defaultLocale && translation.includes("ß")) fail(`Use Swiss spelling with ss, not ß: ${identity}`);
				if (!samePlaceholders(defaultPlaceholders, placeholders(translation))) fail(`Placeholders for ${locale} differ from ${value.defaultLocale}: ${identity}`);
				entries.push({ locale, scope, key, value: translation });
			}
		}
	}
	if (!entries.some((entry) => entry.locale === value.defaultLocale && entry.scope === "shared" && entry.key === "error.internal")) {
		fail(`Missing ${value.defaultLocale} text for shared:error.internal.`);
	}
	return entries.sort((left, right) =>
		left.scope.localeCompare(right.scope) || left.key.localeCompare(right.key) || left.locale.localeCompare(right.locale)
	);
}

function placeholders(value) {
	return [...value.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]).sort();
}

function samePlaceholders(left, right) {
	return left.length === right.length && left.every((placeholder, index) => placeholder === right[index]);
}

function renderTypeScript(defaultLocale, entries) {
	const keys = [...new Set(entries.map((entry) => entry.key))].sort();
	return `// Generated from localization/product-catalog.json. DO NOT EDIT.\n\nexport const productDefaultLocale = ${JSON.stringify(defaultLocale)} as const;\n\nexport const productTranslationKeys = [\n${keys.map((key) => `\t${JSON.stringify(key)},`).join("\n")}\n] as const;\n\nexport type ProductTranslationKey = (typeof productTranslationKeys)[number];\n`;
}

function renderGo(defaultLocale, entries) {
	return `// Code generated from localization/product-catalog.json. DO NOT EDIT.\n\npackage localization\n\nimport "github.com/besartmorina/clinks/server/internal/core/domain"\n\nconst productDefaultLocale domain.Locale = ${goString(defaultLocale)}\n\nvar productTranslationEntries = []domain.Translation{\n${entries
		.map(
			(entry) =>
				`\t{Locale: ${goString(entry.locale)}, ApplicationScope: domain.${validScopes.get(entry.scope)}, Key: ${goString(entry.key)}, Value: ${goString(entry.value)}},`
		)
		.join("\n")}\n}\n`;
}

function renderTransitionMigration(entries) {
	return `-- Generated from localization/product-catalog.json. DO NOT EDIT.\n-- Existing product texts become source-controlled catalog values; only differing rows remain overrides.\n\nDELETE FROM translations AS override\nUSING (VALUES\n${entries
		.map((entry) => `    (${sqlString(entry.locale)}, ${sqlString(entry.scope)}, ${sqlString(entry.key)}, ${sqlString(entry.value)})`)
		.join(",\n")}\n) AS baseline (locale, application_scope, key, value)\nWHERE override.locale = baseline.locale\n  AND override.application_scope = baseline.application_scope\n  AND override.key = baseline.key\n  AND override.value = baseline.value;\n\nALTER TABLE translations RENAME TO translation_overrides;\nALTER TABLE translation_overrides RENAME CONSTRAINT translations_pkey TO translation_overrides_pkey;\nALTER TABLE translation_overrides RENAME CONSTRAINT translations_scope_check TO translation_overrides_scope_check;\n\nALTER TABLE users ALTER COLUMN locale SET DEFAULT 'de-CH';\nUPDATE languages SET is_default = FALSE WHERE is_default = TRUE AND code <> 'de-CH';\nUPDATE languages SET is_default = TRUE, is_active = TRUE WHERE code = 'de-CH';\n`;
}

function goString(value) {
	return JSON.stringify(value);
}

function sqlString(value) {
	return `'${value.replaceAll("'", "''")}'`;
}

async function verifyOutput(path, expected) {
	let actual;
	try {
		actual = await readFile(path, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") fail(`Missing generated file: ${path}`);
		throw error;
	}
	if (actual !== expected) fail(`Generated file is stale: ${path}. Run pnpm generate:translations.`);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
