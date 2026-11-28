import { publicRoutes, webLink } from '@clinks/contracts/public-links';
import type {
	DocumentShareCreated,
	DocumentShareView,
	SharedFile,
	SharedFileDetails,
} from '@clinks/contracts/documents';
import { newId } from '@clinks/domain/ids';
import type { WorkspaceCache } from './database.ts';
import { allowedCaller, appendAudit, mockError, type RequestContext } from './repository.ts';

const day = 86_400_000;

/** The demo's stand-in for apps/api services/document-shares.ts: the same lifetimes, counting and ending. */
export class MockDocumentShares {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	list(documentId: string): Promise<DocumentShareView[]> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'documents.read');
			return this.#db
				.table('documentShares')
				.filter((row) => row.tenantId === tenantId && row.documentId === documentId)
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
				.map(({ id, expiresAt, revokedAt, openCount, createdAt }) => ({
					id,
					expiresAt,
					revokedAt,
					openCount,
					createdAt,
				}));
		});
	}

	create(documentId: string, days: 1 | 7 | 30): Promise<DocumentShareCreated> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'documents.write');
			const document = this.#db.table('documents').find((row) => row.id === documentId && row.tenantId === tenantId);
			if (!document) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
			const now = new Date();
			const share = {
				id: newId(),
				tenantId,
				documentId,
				token: crypto.randomUUID().replaceAll('-', ''),
				expiresAt: new Date(now.getTime() + days * day).toISOString(),
				revokedAt: null,
				openCount: 0,
				createdAt: now.toISOString(),
			};
			this.#db.table('documentShares').push(share);
			appendAudit(this.#db, {
				tenantId,
				actorId,
				action: 'document.shared',
				target: { kind: 'document', id: documentId, label: document.name },
			});
			const { token, tenantId: _tenant, documentId: _document, ...view } = share;
			return { ...view, url: webLink(location.href, publicRoutes.documentShare(token)) };
		}, ['documentShares', 'audit']);
	}

	revoke(shareId: string): Promise<void> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'documents.write');
			const share = this.#db.table('documentShares').find((row) => row.id === shareId && row.tenantId === tenantId);
			if (!share || share.revokedAt) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
			share.revokedAt = new Date().toISOString();
			this.#db.merge({ documentShares: [share] });
		}, ['documentShares']);
	}

	details(token: string): Promise<SharedFileDetails> {
		return this.#db.request(() => {
			const { share, document } = this.#find(token);
			const tenant = this.#db.table('tenants').find((row) => row.id === share.tenantId);
			return { tenantName: tenant?.name ?? '', name: document.name, size: document.size, expiresAt: share.expiresAt };
		});
	}

	open(token: string): Promise<SharedFile> {
		return this.#db.request(() => {
			const { share, document } = this.#find(token);
			share.openCount += 1;
			this.#db.merge({ documentShares: [share] });
			return { name: document.name, mimeType: document.mimeType, url: document.dataUrl };
		}, ['documentShares']);
	}

	#find(token: string) {
		const share = this.#db.table('documentShares').find((row) => row.token === token);
		const document = share && this.#db.table('documents').find((row) => row.id === share.documentId);
		if (!share || !document || share.revokedAt || Date.parse(share.expiresAt) <= Date.now())
			throw mockError(this.#context, 'not_found', 'error.ws.share_invalid');
		return { share, document };
	}
}
