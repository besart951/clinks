import { sql } from 'kysely';
import { maxDocumentBytes } from '@clinks/contracts/workspace-schemas';
import { inScope, type Tx } from '@clinks/db/scope';
import { z } from 'zod';
import { ApiError, forbidden } from '../errors.ts';
import { uuid } from '../crypto.ts';
import type { AccessClaims } from '../tokens.ts';
import type { Caller, Services } from './context.ts';
import { requirePermission } from './permissions.ts';
import { audit } from './audit.ts';
import { tenantStores } from './storage.ts';

type Scope = { tenantId: string; userId: string };
const mimeType = z
	.string()
	.regex(/^[\w.+-]+\/[\w.+-]+$/u)
	.max(128);
export const versionUpload = z.object({
	size: z.int().min(0).max(maxDocumentBytes),
	mimeType,
	checksum: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
});

function objectKey(tenantId: string, documentId: string, id: string) {
	return `${tenantId}/${documentId}/${id}`;
}
function getVersion(tx: Tx, documentId: string, id: string) {
	return tx
		.selectFrom('documentVersions')
		.selectAll()
		.where('documentId', '=', documentId)
		.where('id', '=', id)
		.executeTakeFirst();
}

/** Store the durable PowerSync upload before its SQL transaction is acknowledged. Never replicate file bytes. */
export async function storeDocument(
	tx: Tx,
	services: Services,
	scope: Scope,
	documentId: string,
	fields: Record<string, unknown>,
	previous: unknown,
) {
	const ref = String(fields.dataUrl);
	if (ref.startsWith('version:')) {
		const saved = await getVersion(tx, documentId, ref.slice(8));
		if ((previous && previous !== ref) || !saved || saved.size !== fields.size || saved.mimeType !== fields.mimeType)
			throw new ApiError(400, 'error.validation');
		return { dataUrl: ref };
	}
	const { store, storageId } = await tenantStores(services).active(tx, scope.tenantId);
	if (!store) return { dataUrl: ref };
	const match = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/u.exec(ref);
	if (!match || !mimeType.safeParse(fields.mimeType).success) throw new ApiError(400, 'error.validation');
	const bytes = Buffer.from(match[1], 'base64');
	if (bytes.length !== fields.size || bytes.length > maxDocumentBytes) throw new ApiError(400, 'error.validation');
	// The first upload uses the document id as its operation id, including on a retry after a lost response.
	const first = await getVersion(tx, documentId, documentId);
	if (first && typeof previous === 'string' && previous.startsWith('version:')) {
		const latest = await getVersion(tx, documentId, previous.slice(8));
		if (!latest) throw new ApiError(409, 'error.conflict');
		return { dataUrl: previous, size: latest.size, mimeType: latest.mimeType };
	}
	const id = first ? uuid() : documentId;
	const key = objectKey(scope.tenantId, documentId, id);
	const type = String(fields.mimeType);
	const objectVersion = await store.put(key, bytes, type);
	await tx
		.insertInto('documentVersions')
		.values({
			id,
			tenantId: scope.tenantId,
			documentId,
			objectKey: key,
			objectVersion,
			authorId: scope.userId,
			mimeType: type,
			size: bytes.length,
			storageId,
		})
		.execute();
	return { dataUrl: 'version:' + id };
}

export class FileService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}
	async withDocument<T>(
		claims: AccessClaims,
		id: string,
		write: boolean,
		work: (tx: Tx, scope: Scope, current: string) => Promise<T>,
	) {
		if (!claims.tenant_id) throw forbidden();
		const scope = { tenantId: claims.tenant_id, userId: claims.sub };
		return inScope(this.#services.db, scope, async (tx) => {
			await requirePermission(tx, scope.tenantId, scope.userId, write ? 'documents.write' : 'documents.read');
			const query = tx.selectFrom('documents').select(['id', 'dataUrl']).where('id', '=', id);
			const doc = await (write ? query.forUpdate() : query).executeTakeFirst();
			if (!doc) throw new ApiError(404, 'error.ws.not_found');
			return work(tx, scope, String(doc.dataUrl));
		});
	}
	list(claims: AccessClaims, doc: string) {
		return this.withDocument(claims, doc, false, (tx) =>
			tx
				.selectFrom('documentVersions')
				.select(['id', 'size', 'mimeType', 'createdAt'])
				.where('documentId', '=', doc)
				.orderBy('createdAt', 'desc')
				.execute(),
		);
	}
	download(claims: AccessClaims, doc: string, id: string) {
		return this.withDocument(claims, doc, false, async (tx) => {
			const row = await getVersion(tx, doc, id);
			if (!row) throw new ApiError(404, 'error.ws.not_found');
			const store = required(await tenantStores(this.#services).of(tx, row.storageId));
			return { url: await store.download(row.objectKey, row.objectVersion) };
		});
	}
	upload(claims: AccessClaims, doc: string, input: z.infer<typeof versionUpload>) {
		return this.withDocument(claims, doc, true, async (tx, scope) => {
			const store = required((await tenantStores(this.#services).active(tx, scope.tenantId)).store);
			const id = uuid();
			return {
				id,
				url: await store.upload(objectKey(scope.tenantId, doc, id), input.size, input.mimeType, input.checksum),
			};
		});
	}
	commit(claims: AccessClaims, doc: string, id: string, source?: string, caller: Caller | null = null) {
		return this.withDocument(claims, doc, true, async (tx, scope) => {
			if (await getVersion(tx, doc, id)) return { id };
			const { store, storageId } = await tenantStores(this.#services).active(tx, scope.tenantId);
			const key = objectKey(scope.tenantId, doc, id);
			const saved = source ? await getVersion(tx, doc, source) : null;
			if (source && !saved) throw new ApiError(404, 'error.ws.not_found');
			const object = saved ?? (await required(store).inspect(key));
			if (object.size === undefined || object.size > maxDocumentBytes || !mimeType.safeParse(object.mimeType).success)
				throw new ApiError(400, 'error.validation');
			const fields = { size: object.size, mimeType: object.mimeType! };
			await tx
				.insertInto('documentVersions')
				.values({
					id,
					tenantId: scope.tenantId,
					authorId: scope.userId,
					documentId: doc,
					objectKey: saved?.objectKey ?? key,
					objectVersion: object.objectVersion,
					// A restore points at the bytes it restores, wherever they live.
					storageId: saved ? saved.storageId : storageId,
					...fields,
				})
				.execute();
			await tx
				.updateTable('documents')
				.set({
					...fields,
					dataUrl: 'version:' + id,
					revision: sql<number>`revision + 1`,
					updatedAt: this.#services.now(),
				})
				.where('id', '=', doc)
				.execute();
			await audit(
				tx,
				{
					action: source ? 'document.restored' : 'document.updated',
					tenantId: scope.tenantId,
					actorId: scope.userId,
					target: doc,
				},
				caller,
			);
			return { id };
		});
	}
}

/** Files need a bucket: CLinks storage (S3_BUCKET) or the tenant's own. */
function required<T>(store: T | undefined): T {
	if (!store) throw new ApiError(503, 'error.internal');
	return store;
}
