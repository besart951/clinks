import { inScope } from '@clinks/db/scope';
import { ApiError, forbidden } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import type { Services } from './context.ts';
import { documentUrl } from './files.ts';
import { requirePermission } from './permissions.ts';

/** Invoices beyond sync: the archived PDF (and, later, sending, reminders and bank files). */
export class InvoiceService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** Where the archived PDF/A of an issued invoice can be downloaded; for anyone who may read finance. */
	pdf(claims: AccessClaims, invoiceId: string) {
		if (!claims.tenant_id) throw forbidden();
		const scope = { tenantId: claims.tenant_id, userId: claims.sub };
		return inScope(this.#services.db, scope, async (tx) => {
			await requirePermission(tx, scope.tenantId, scope.userId, 'finance.read');
			const invoice = await tx
				.selectFrom('invoices')
				.select('documentId')
				.where('id', '=', invoiceId)
				.executeTakeFirst();
			if (!invoice?.documentId) throw new ApiError(404, 'error.ws.not_found');
			return { url: await documentUrl(tx, this.#services, String(invoice.documentId)) };
		});
	}
}
