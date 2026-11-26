import type { DeviceSessionDto, TeamResponse } from '@clinks/contracts/auth';
import type { InvitationId, MembershipId, RoleId, SessionId, UserId } from '@clinks/domain/ids';
import type { Invitation, Membership, Role } from '@clinks/domain/types';
import type { StorageCheck, StorageSettingsInput, StorageSettingsView } from '@clinks/domain/storage';
import { roleGrants } from '@clinks/domain/permissions';
import type { RemoteAuthGateway } from '../session/remote-auth.ts';
import { AccountApi, roleFor, type Caller, type Member, type MemberChanges } from './account-api.ts';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceCache } from './database.ts';

type InvitationRow = Pick<Invitation, 'id' | 'email' | 'roleId' | 'status' | 'expiresAt' | 'invitedBy' | 'createdAt'>;
function stamps() {
	const now = new Date().toISOString();
	return { createdAt: now, updatedAt: now, revision: 1 };
}
export class RemoteAccountApi extends AccountApi {
	readonly #db: WorkspaceCache;
	readonly #caller: Caller;
	readonly #client: ApiClient;
	readonly #auth: RemoteAuthGateway;
	constructor(db: WorkspaceCache, caller: Caller, client: ApiClient, auth: RemoteAuthGateway) {
		super(db, caller);
		this.#db = db;
		this.#caller = caller;
		this.#client = client;
		this.#auth = auth;
	}
	override async exportTenantData() {
		const data = await super.exportTenantData();
		const role = roleFor(this.#db, this.#caller.userId(), this.#caller.tenantId());
		if (!roleGrants(role, 'team.manage') && !roleGrants(role, 'roles.manage')) return data;
		const { members, roles, invitations } = await this.members();
		return { ...data, memberships: members.map(({ membership }) => membership), roles, invitations };
	}
	override async updateProfile(changes: Parameters<AccountApi['updateProfile']>[0]) {
		const { email: _, ...fields } = changes;
		await this.#client.request('POST', '/me/profile', fields);
		await this.#auth.loadAccount();
		return (await this.snapshotFor(this.#caller.userId()!)).user;
	}
	override async updateTenant(changes: Parameters<AccountApi['updateTenant']>[0]) {
		await this.#client.request('POST', '/tenant/settings', changes);
		await this.#auth.loadAccount();
		return this.#db.table('tenants').find((t) => t.id === this.#caller.tenantId())!;
	}
	override changePassword(currentPassword: string, newPassword: string) {
		return this.#client.request<void>('POST', '/me/password', { currentPassword, newPassword });
	}
	override async sessions() {
		const list = await this.#client.request<DeviceSessionDto[]>('GET', '/me/sessions');
		return list
			.sort((a, b) => Number(b.current) - Number(a.current))
			.map((row) => ({
				...stamps(),
				...row,
				id: row.id as SessionId,
				userId: this.#caller.userId()!,
				location: row.ip ?? '',
			}));
	}
	override async revokeSession(id: SessionId) {
		await this.#client.request('DELETE', '/me/sessions/' + id);
		this.#db.touch('sessions');
	}
	override async members() {
		const tenantId = this.#caller.tenantId()!;
		const role = roleFor(this.#db, this.#caller.userId(), tenantId);
		const [team, invites] = await Promise.all([
			this.#client.request<TeamResponse>('GET', '/tenant/team'),
			roleGrants(role, 'team.manage') ? this.#client.request<InvitationRow[]>('GET', '/tenant/invitations') : [],
		]);
		const roles = team.roles.map((row) => ({ ...stamps(), ...row }) as Role);
		const members: Member[] = team.people.map(({ membership, user, access }) => ({
			membership: { ...stamps(), ...membership } as Membership,
			user: { ...user, id: user.id as UserId },
			role: roles.find((r) => r.id === membership.roleId)!,
			access,
		}));
		return {
			members,
			roles,
			invitations: invites.filter((row) => row.status === 'pending').map((row) => ({ ...stamps(), ...row, tenantId })),
		};
	}
	override async invite(email: string, roleId: RoleId) {
		const row = await this.#client.request<InvitationRow>('POST', '/tenant/invitations', { email, roleId });
		this.#db.touch('invitations');
		return { ...stamps(), ...row, tenantId: this.#caller.tenantId()! };
	}
	override async revokeInvitation(id: InvitationId) {
		await this.#client.request('DELETE', '/tenant/invitations/' + id);
		this.#db.touch('invitations');
	}
	override async resendInvitation(id: InvitationId) {
		await this.#client.request('POST', '/tenant/invitations/' + id + '/resend');
		this.#db.touch('invitations');
	}
	override async changeMember(id: MembershipId, changes: MemberChanges) {
		await this.#client.request('POST', '/tenant/members/' + id, changes);
		const member = (await this.members()).members.find((member) => member.membership.id === id)!;
		this.#db.touch('memberships');
		return member.membership;
	}
	override async signOutMember(id: MembershipId) {
		await this.#client.request('POST', `/tenant/members/${id}/sign-out`);
		this.#db.touch('memberships');
	}
	override async saveRole(input: Parameters<AccountApi['saveRole']>[0]) {
		const { id } = await this.#client.request<{ id: RoleId }>('POST', '/tenant/roles', input);
		const role = (await this.members()).roles.find((role) => role.id === id)!;
		this.#db.touch('roles');
		return role;
	}
	override async deleteRole(id: RoleId) {
		await this.#client.request('DELETE', '/tenant/roles/' + id);
		this.#db.touch('roles');
	}

	/** Storage settings and the secret live only on the server; nothing of them is cached in the browser. */
	override storageSettings() {
		return this.#client.request<StorageSettingsView | null>('GET', '/tenant/storage');
	}
	override saveStorageSettings(input: StorageSettingsInput) {
		return this.#client.request<StorageSettingsView | null>('POST', '/tenant/storage', input);
	}
	override testStorageConnection() {
		return this.#client.request<StorageCheck>('POST', '/tenant/storage/test');
	}
}
