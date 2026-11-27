import type {
	DocumentShareCreated,
	DocumentShareView,
	SharedFile,
	SharedFileDetails,
} from '@clinks/contracts/documents';
import { inScope, type Tx } from '@clinks/db/scope';
import { uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { documentUrl } from './files.ts';
import { findLink, issueLink } from './one-time.ts';
import { withPermission } from './permissions.ts';

const day = 86_400_000;

/**
 * «Teilen-Link»: one file for someone without an account, until a date. The link is shown once when made; the
 * workspace sees each share with its end and how often it was opened, and can end it early.
 */
export class DocumentShares {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	create(claims: AccessClaims, documentId: string, days: number, caller: Caller): Promise<DocumentShareCreated> {
		return withPermission(this.#services.db, claims, 'documents.write', async (tx, scope) => {
			const document = await tx.selectFrom('documents').select('id').where('id', '=', documentId).executeTakeFirst();
			if (!document) throw new ApiError(404, 'error.ws.not_found');
			const now = this.#services.now();
			const id = uuid();
			const expiresAt = new Date(now.getTime() + days * day);
			await tx
				.insertInto('documentShares')
				.values({ id, tenantId: scope.tenantId, documentId, createdBy: scope.userId, expiresAt })
				.execute();
			const { token } = await issueLink(tx, {
				purpose: 'document_share',
				tenantId: scope.tenantId,
				documentShareId: id,
				expiresAt,
				now,
			});
			await audit(
				tx,
				{
					action: 'document.shared',
					actorId: scope.userId,
					tenantId: scope.tenantId,
					target: documentId,
					meta: { days },
				},
				caller,
			);
			const origin = this.#services.config.WEB_ORIGIN ?? '';
			return {
				id,
				expiresAt: expiresAt.toISOString(),
				revokedAt: null,
				openCount: 0,
				createdAt: now.toISOString(),
				url: `${origin}/#/share/${token}`,
			};
		});
	}

	list(claims: AccessClaims, documentId: string): Promise<DocumentShareView[]> {
		return withPermission(this.#services.db, claims, 'documents.read', async (tx) => {
			const rows = await tx
				.selectFrom('documentShares')
				.select(['id', 'expiresAt', 'revokedAt', 'openCount', 'createdAt'])
				.where('documentId', '=', documentId)
				.orderBy('createdAt', 'desc')
				.execute();
			return rows.map((row) => ({
				id: row.id,
				expiresAt: new Date(row.expiresAt).toISOString(),
				revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
				openCount: Number(row.openCount),
				createdAt: new Date(row.createdAt as unknown as string).toISOString(),
			}));
		});
	}

	/** Ends a share now: its token goes, the row stays as the record that it existed. */
	revoke(claims: AccessClaims, shareId: string, caller: Caller): Promise<void> {
		return withPermission(this.#services.db, claims, 'documents.write', async (tx, scope) => {
			const share = await tx
				.updateTable('documentShares')
				.set({ revokedAt: this.#services.now() })
				.where('id', '=', shareId)
				.where('revokedAt', 'is', null)
				.returning('documentId')
				.executeTakeFirst();
			if (!share) throw new ApiError(404, 'error.ws.not_found');
			await tx.deleteFrom('auth.oneTimeTokens').where('documentShareId', '=', shareId).execute();
			await audit(
				tx,
				{ action: 'document.share_revoked', actorId: scope.userId, tenantId: scope.tenantId, target: share.documentId },
				caller,
			);
		});
	}

	/** What the recipient sees: the workspace, the file's name and size, and until when the link works. */
	async details(token: string): Promise<SharedFileDetails> {
		const link = await this.#link(token);
		return inScope(this.#services.db, { tenantId: link.tenantId, userId: null }, async (tx) => {
			const row = await this.#row(tx, link.shareId);
			return { tenantName: row.tenantName, name: row.name, size: row.size, expiresAt: link.expiresAt.toISOString() };
		});
	}

	async open(token: string, caller: Caller): Promise<SharedFile> {
		enforceRateLimit(this.#services.limiter, `document-share:${caller.ip ?? 'unknown'}`, 30);
		const link = await this.#link(token);
		return inScope(this.#services.db, { tenantId: link.tenantId, userId: null }, async (tx) => {
			const row = await this.#row(tx, link.shareId);
			const now = this.#services.now();
			await tx
				.updateTable('documentShares')
				.set((eb) => ({ openCount: eb('openCount', '+', 1), openedAt: now }))
				.where('id', '=', link.shareId)
				.execute();
			await audit(
				tx,
				{ action: 'document.share_opened', actorId: null, tenantId: link.tenantId, target: row.documentId },
				caller,
			);
			return { name: row.name, mimeType: row.mimeType, url: await documentUrl(tx, this.#services, row.documentId) };
		});
	}

	async #link(token: string) {
		const row = await findLink(this.#services.db, 'document_share', token, this.#services.now());
		if (!row?.tenantId || !row.documentShareId) throw new ApiError(404, 'error.ws.share_invalid');
		return { tenantId: row.tenantId, shareId: row.documentShareId, expiresAt: row.expiresAt };
	}

	async #row(tx: Tx, shareId: string) {
		const row = await tx
			.selectFrom('documentShares')
			.innerJoin('documents', 'documents.id', 'documentShares.documentId')
			.innerJoin('tenants', 'tenants.id', 'documentShares.tenantId')
			.select([
				'documentShares.documentId',
				'documentShares.revokedAt',
				'documents.name',
				'documents.size',
				'documents.mimeType',
				'tenants.name as tenantName',
			])
			.where('documentShares.id', '=', shareId)
			.executeTakeFirst();
		if (!row || row.revokedAt) throw new ApiError(404, 'error.ws.share_invalid');
		return {
			documentId: row.documentId,
			name: String(row.name),
			size: Number(row.size),
			mimeType: String(row.mimeType),
			tenantName: row.tenantName,
		};
	}
}
