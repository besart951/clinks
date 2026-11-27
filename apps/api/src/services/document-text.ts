import type { Db } from '@clinks/db/client';
import { inScope } from '@clinks/db/scope';
import { searchableText } from '@clinks/domain/search-text';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Services } from './context.ts';
import { documentBytes } from './files.ts';

/**
 * The text of a file for the search: text files as they are, PDFs from their text layer. Pictures and scans
 * without a text layer give null (reading them would need OCR).
 */
export async function readText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
	let text: string | null = null;
	if (mimeType.startsWith('text/') || mimeType === 'application/json') text = new TextDecoder().decode(bytes);
	else if (mimeType === 'application/pdf') {
		const pdf = await getDocumentProxy(new Uint8Array(bytes));
		text = (await extractText(pdf, { mergePages: true })).text;
	}
	return text === null ? null : searchableText(text);
}

/**
 * Reads the text of queued files (the database queues every new file and version) into `documents.search_text`.
 * A file that cannot be read is left without text; the next version queues it again.
 */
export class DocumentText {
	readonly #services: Services;

	constructor(services: Services) {
		this.#services = services;
	}

	async run(): Promise<number> {
		const due = await claim(this.#services.db);
		for (const row of due)
			await inScope(this.#services.db, { tenantId: row.tenantId, userId: null }, async (tx) => {
				const document = await tx
					.selectFrom('documents')
					.select(['mimeType'])
					.where('id', '=', row.documentId)
					.executeTakeFirst();
				if (!document) return;
				const text = await documentBytes(tx, this.#services, row.documentId)
					.then((bytes) => readText(bytes, String(document.mimeType)))
					.catch((error: unknown) => {
						console.error(
							JSON.stringify({ event: 'documents.text_failed', errorType: (error as Error)?.name ?? 'Error' }),
						);
						return null;
					});
				// No new revision: the text belongs to the version already there and must not clash with edits.
				await tx.updateTable('documents').set({ searchText: text }).where('id', '=', row.documentId).execute();
			});
		return due.length;
	}

	/** Until nothing waits: for tests. */
	async drain() {
		while ((await this.run()) > 0);
	}
}

async function claim(db: Db) {
	return db
		.deleteFrom('auth.documentTextQueue')
		.where(
			'documentId',
			'in',
			db
				.selectFrom('auth.documentTextQueue')
				.select('documentId')
				.orderBy('queuedAt')
				.limit(20)
				.forUpdate()
				.skipLocked(),
		)
		.returning(['documentId', 'tenantId'])
		.execute();
}
