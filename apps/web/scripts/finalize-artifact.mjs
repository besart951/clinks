import { readFile, writeFile } from 'node:fs/promises';

/** The single-file build inlines library code that contains a raw U+FFFD; hosts reject that, so escape it. */
const path = new URL('../build-artifact/index.html', import.meta.url);
const html = await readFile(path, 'utf8');
await writeFile(path, html.replaceAll('�', '\\uFFFD'));
