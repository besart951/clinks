import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readOnlyColumns, localTableNames, serverColumns, syncedTables, type ColumnType } from '../src/tables.ts';

// Writes the PowerSync client schema for TypeScript. A Dart generator for the Flutter app comes later
// from the same definition. `--check` fails when the committed file is out of date.

const sqliteType: { [type in ColumnType]: 'text' | 'integer' } = {
	text: 'text',
	uuid: 'text',
	timestamp: 'text',
	date: 'text',
	json: 'text',
	integer: 'integer',
	boolean: 'integer',
};

const tables = Object.entries(syncedTables).map(([name, table]) => {
	const columns = [...serverColumns, ...table.columns].map(
		(column) => `\t${column.column}: column.${sqliteType[column.type]},`,
	);
	return `export const ${name} = new Table(\n\t{\n${columns.map((line) => `\t${line}`).join('\n')}\n\t},\n\t{ indexes: { tenant: ['tenant_id'] } },\n);`;
});

for (const [name, columns] of Object.entries(readOnlyColumns)) {
	tables.push(
		`export const ${name} = new Table({\n${columns.map((column) => `\t${column}: column.text,`).join('\n')}\n});`,
	);
}

const output = `// Generated from src/tables.ts by \`pnpm --filter @clinks/sync-schema generate\`. DO NOT EDIT.
import { column, Schema, Table } from '@powersync/common';

${tables.join('\n\n')}

export const powerSyncSchema = new Schema({ ${localTableNames.join(', ')} });
`;

const target = fileURLToPath(new URL('../src/powersync-schema.generated.ts', import.meta.url));
if (process.argv.includes('--check')) {
	if ((await readFile(target, 'utf8').catch(() => '')) !== output) {
		console.error(
			'src/powersync-schema.generated.ts is out of date: run `pnpm --filter @clinks/sync-schema generate`.',
		);
		process.exit(1);
	}
} else {
	await writeFile(target, output);
}
