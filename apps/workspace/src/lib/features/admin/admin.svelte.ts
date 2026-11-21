import type { TenantId } from '../../domain/ids.ts';
import type { TenantOverview } from '../../data/account-api.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export const featureFlags = ['command_palette', 'beta_reports', 'assistant'] as const;

/** Platform backoffice for the super administrator: tenants, feature flags, support access. */
export class AdminModel {
	readonly resource: Resource<TenantOverview[]>;
	search = $state('');
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['tenants', 'memberships', 'contacts', 'invoices'], () => workspace.account.platformTenants());
	}

	get rows(): TenantOverview[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data ?? []).filter((row) => !query || row.tenant.name.toLowerCase().includes(query));
	}

	setFlag(tenantId: TenantId, flag: string, enabled: boolean) {
		return this.#workspace.run(() => this.#workspace.account.setFeatureFlag(tenantId, flag, enabled), { success: 'ui.ws.admin.flag_saved' });
	}

	/** Support access: view the tenant as one of its administrators, clearly marked by a banner. */
	async impersonate(tenantId: TenantId): Promise<boolean> {
		const members = await this.#workspace.account.platformMembers(tenantId);
		const target = members.find((member) => member.role.kind === 'administrator') ?? members[0];
		if (!target) return false;
		await this.#workspace.session.impersonate(target.user.id, tenantId);
		return true;
	}
}
