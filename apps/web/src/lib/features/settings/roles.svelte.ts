import type { RoleId } from '@clinks/domain/ids';
import type { Permission, Role } from '@clinks/domain/types';
import {
	dormantProducts,
	productBooked,
	rightGroups,
	roleAvailable,
	templateFor,
	type ProductKey,
} from '@clinks/domain/products';
import type { Member } from '../../data/account-api.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { SettingsForm } from './settings.svelte.ts';

/** Settings › Rollen: the rights of each role, in sections per booked product. */
export class RolesModel extends SettingsForm {
	readonly resource: Resource<{ roles: Role[]; members: Member[] }>;
	editing = $state<{ id: RoleId | null; name: string; permissions: Permission[] } | null>(null);

	constructor(workspace: Workspace) {
		super(workspace);
		this.resource = new Resource(workspace.db, ['roles', 'memberships'], async () => {
			const data = await workspace.account.members();
			return { roles: data.roles, members: data.members };
		});
	}

	#tenant() {
		return this.workspace.session.tenant ?? { plan: 'starter' as const, enabledModules: [] };
	}

	/** Roles that can be given in this workspace: templates of unbooked products stay hidden. */
	available(roles: Role[]): Role[] {
		return roles.filter((role) => roleAvailable(role, this.#tenant()));
	}

	/** The sections of the matrix: the basics, each booked product, administration. */
	get groups() {
		return rightGroups().filter((group) => group.areas.length > 0 && productBooked(this.#tenant(), group.product));
	}

	/** Products whose rights the role holds although they are not booked. */
	dormant(role: Pick<Role, 'permissions'>): ProductKey[] {
		return dormantProducts(role.permissions, this.#tenant());
	}

	/** The product a template role comes with. */
	templateProduct(role: Pick<Role, 'template'>): ProductKey | null {
		return templateFor(role.template)?.product ?? null;
	}

	usage(roleId: RoleId) {
		return (this.resource.data?.members ?? []).filter(
			(member) => member.role.id === roleId && member.membership.status === 'active',
		).length;
	}

	edit(role: Role | null) {
		this.editing = role
			? { id: role.id, name: role.name, permissions: [...role.permissions] }
			: { id: null, name: '', permissions: ['contacts.read', 'calendar.read'] };
		this.fields = {};
	}

	toggle(permission: Permission) {
		if (!this.editing) return;
		const has = this.editing.permissions.includes(permission);
		this.editing.permissions = has
			? this.editing.permissions.filter((candidate) => candidate !== permission)
			: [...this.editing.permissions, permission];
		if (!has && permission.endsWith('.write')) {
			const read = permission.replace('.write', '.read') as Permission;
			if (!this.editing.permissions.includes(read)) this.editing.permissions = [...this.editing.permissions, read];
		}
	}

	async save(): Promise<boolean> {
		if (!this.editing) return false;
		const saved = await this.attempt(
			() => this.workspace.account.saveRole($state.snapshot(this.editing!)),
			'ui.ws.roles.saved',
		);
		if (saved) {
			this.editing = null;
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	async reset(role: Role) {
		const saved = await this.attempt(() => this.workspace.account.resetRole(role.id), 'ui.ws.roles.reset_done');
		if (saved) {
			this.editing = null;
			await this.workspace.session.refresh();
		}
	}

	remove(role: Role) {
		return this.workspace.run(() => this.workspace.account.deleteRole(role.id), { success: 'ui.ws.roles.deleted' });
	}
}
