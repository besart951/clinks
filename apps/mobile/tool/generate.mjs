import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const paths = read('packages/contracts/openapi.json').paths;
const response = (path, method) => paths[path][method].responses['200'].content['application/json'].schema;
const models = {
	SessionTokens: response('/auth/refresh', 'post'),
	TenantSummary: response('/me', 'get').properties.tenants.items,
};
let output = '// Generated from packages/contracts/openapi.json. Run node tool/generate.mjs.\n';
for (const [name, schema] of Object.entries(models)) {
	const fields = Object.entries(schema.properties)
		.filter(([key]) => name !== 'TenantSummary' || ['id', 'name'].includes(key))
		.map(([key, prop]) => {
			const optional = !schema.required.includes(key) || (Array.isArray(prop.type) && prop.type.includes('null'));
			const kind = Array.isArray(prop.type) ? prop.type.find((type) => type !== 'null') : prop.type;
			const type = { string: 'String', boolean: 'bool', array: 'List<String>' }[kind];
			if (!type || (kind === 'array' && prop.items.type !== 'string')) throw Error('Unsupported property ' + key);
			return {
				key,
				type: type + (optional ? '?' : ''),
				value:
					kind === 'array'
						? `List<String>.from(json['${key}'] as List)`
						: `json['${key}'] as ${type}${optional ? '?' : ''}`,
			};
		});
	output +=
		`class ${name} {\n` +
		fields.map((f) => `  final ${f.type} ${f.key};\n`).join('') +
		`  ${name}.fromJson(Map<String, dynamic> json)\n      : ` +
		fields.map((f) => `${f.key} = ${f.value}`).join(',\n        ') +
		';\n}\n\n';
}
emit('models.g.dart', output.trimEnd() + '\n');
const catalog = Object.assign({}, ...Object.values(read('localization/product-catalog.json').translations));
const keys = [
	'ui.email',
	'ui.password',
	'ui.sign_in',
	'ui.sign_out',
	'ui.tenants',
	'ui.ws.auth.code',
	'ui.ws.module.contacts',
	'ui.ws.contacts.empty_title',
	'error.internal',
	'error.ws.offline',
	'ui.ws.auth.verify_submit',
	'ui.ws.mobile.existing',
	'ui.ws.mobile.config',
];
for (const key of keys) if (!catalog[key]) throw Error('Unknown catalog key ' + key);
emit(
	'strings.g.dart',
	'// Generated from localization/product-catalog.json.\nconst labels = <String, List<String>>{\n' +
		keys
			.map(
				(key) =>
					`  '${key}': [${['de-CH', 'en-US'].map((locale) => JSON.stringify(catalog[key][locale])).join(', ')}],`,
			)
			.join('\n') +
		'\n};\n',
);

function emit(name, value) {
	const path = new URL('apps/mobile/lib/' + name, root);
	if (process.argv.includes('--check')) {
		if (readFileSync(path, 'utf8') !== value)
			throw Error('Regenerate ' + name + ' with node apps/mobile/tool/generate.mjs');
	} else writeFileSync(path, value);
}
