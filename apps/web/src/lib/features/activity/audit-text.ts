import type { AuditEntry } from '@clinks/domain/types';

const knownActions = new Set([
	'created',
	'updated',
	'deleted',
	'restored',
	'revoked',
	'accepted',
	'plan_changed',
	'cancelled',
	'resumed',
	'payment_method_changed',
	'storage_changed',
	'role_changed',
	'deactivated',
	'reactivated',
	'signed_out',
	'reset',
]);

/** Translation key for an audit action such as `invoice.created`. */
export function auditKey(entry: Pick<AuditEntry, 'action'>): string {
	const [kind, verb] = entry.action.split('.');
	return knownActions.has(verb) ? `ui.ws.audit.${kind}.${verb}` : 'ui.ws.audit.generic';
}

/** Where the audit target can be opened, if it still has a page. */
export function auditPath(entry: Pick<AuditEntry, 'target' | 'action'>): string | null {
	if (entry.action.endsWith('.deleted')) return null;
	const { kind, id } = entry.target;
	switch (kind) {
		case 'contact':
			return `/contacts/${id}`;
		case 'invoice':
			return `/finance/invoices/${id}`;
		case 'task':
			return `/planner/${id}`;
		case 'campaign':
			return `/mail/campaigns/${id}`;
		case 'appointment':
			return `/calendar?appointment=${id}`;
		default:
			return null;
	}
}
