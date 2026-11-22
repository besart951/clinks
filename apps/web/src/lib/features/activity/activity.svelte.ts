import type { AuditEntry, AuditTargetKind } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** The tenant's audit log, filtered in the browser like the real API filters in PostgreSQL. */
export class ActivityModel {
	readonly resource: Resource<AuditEntry[]>;
	actor = $state('');
	kind = $state<AuditTargetKind | ''>('');
	from = $state('');
	to = $state('');
	search = $state('');
	limit = $state(50);

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['audit'], async () =>
			(await workspace.api.audit.list()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
		);
	}

	get kinds(): AuditTargetKind[] {
		return [...new Set((this.resource.data ?? []).map((entry) => entry.target.kind))].sort();
	}

	get filtered(): AuditEntry[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data ?? []).filter(
			(entry) =>
				(!this.actor || entry.actorId === this.actor) &&
				(!this.kind || entry.target.kind === this.kind) &&
				(!this.from || entry.createdAt.slice(0, 10) >= this.from) &&
				(!this.to || entry.createdAt.slice(0, 10) <= this.to) &&
				(!query || `${entry.action} ${entry.target.label}`.toLowerCase().includes(query)),
		);
	}

	get visible(): AuditEntry[] {
		return this.filtered.slice(0, this.limit);
	}
}
