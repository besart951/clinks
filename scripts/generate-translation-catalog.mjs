import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "localization/product-catalog.json");
const typeOutputPath = join(root, "packages/i18n-types/src/product-translation-key.generated.ts");
const validScopes = new Set(["shared"]);

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const entries = validateCatalog(catalog);
const typeOutput = renderTypeScript(catalog.defaultLocale, entries);

if (process.argv.includes("--check")) {
	await verifyOutput(typeOutputPath, typeOutput);
	process.exit(0);
}

await writeFile(typeOutputPath, typeOutput);

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
			if (!/^(audit|error|mail|ui)\.[a-z_]+(?:\.[a-z_]+)*$/.test(key)) fail(`Invalid translation key: ${key}`);
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
	const defaults = entries.filter((entry) => entry.locale === defaultLocale && entry.scope === "shared");
	return `// Generated from localization/product-catalog.json. DO NOT EDIT.\n\nexport const productDefaultLocale = ${JSON.stringify(defaultLocale)} as const;\n\nexport const productDefaultTranslations = {\n${defaults.map((entry) => `\t${JSON.stringify(entry.key)}: ${JSON.stringify(entry.value)},`).join("\n")}\n} as const;\n\nexport const productTranslationKeys = [\n${keys.map((key) => `\t${JSON.stringify(key)},`).join("\n")}\n] as const;\n\nexport type ProductTranslationKey = (typeof productTranslationKeys)[number];\n`;
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
