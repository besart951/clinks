import type { InvitationId, MembershipId, RoleId } from '@clinks/domain/ids';
import type { Appointment, AuditEntry, Invitation, Role } from '@clinks/domain/types';
import { roleAvailable } from '@clinks/domain/products';
import type { Member } from '../../data/account-api.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { SettingsForm } from './settings.svelte.ts';

/** Membership changes the team page lists under «Letzte Änderungen». */
const teamActions = /^(membership|invitation)\./;

/** Settings › Team: who has a login, with which role, when they last signed in, and what changed. */
export class TeamModel extends SettingsForm {
	readonly resource: Resource<{ members: Member[]; invitations: Invitation[]; roles: Role[] }>;
	/** Future Spitex visits and the team's audit entries, as far as the caller may read them. */
	readonly context: Resource<{ visits: Appointment[]; log: AuditEntry[] }>;
	inviteEmail = $state('');
	inviteRole = $state<RoleId | ''>('');
	search = $state('');

	constructor(workspace: Workspace) {
		super(workspace);
		this.resource = new Resource(workspace.db, ['memberships', 'invitations', 'roles', 'users', 'sessions'], () =>
			workspace.account.members(),
		);
		this.context = new Resource(workspace.db, ['appointments', 'audit'], async () => {
			const now = new Date().toISOString();
			const [visits, log] = await Promise.all([
				workspace.session.can('spitex.read')
					? workspace.api.appointments.list(
							(row) => row.kind === 'spitex' && row.assigneeId !== null && row.start >= now,
						)
					: [],
				workspace.session.can('audit.read') ? workspace.api.audit.list((entry) => teamActions.test(entry.action)) : [],
			]);
			return { visits, log: log.sort((left, right) => right.createdAt.localeCompare(left.createdAt)) };
		});
	}

	get members(): Member[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data?.members ?? [])
			.filter(
				(member) =>
					!query ||
					`${member.user.firstName} ${member.user.lastName} ${member.user.email}`.toLowerCase().includes(query),
			)
			.sort(
				(left, right) =>
					Number(right.membership.status === 'active') - Number(left.membership.status === 'active') ||
					left.user.lastName.localeCompare(right.user.lastName),
			);
	}

	/** Roles that can be given now: templates of unbooked products only stay for whoever already has them. */
	assignableRoles(current: RoleId | null = null): Role[] {
		const tenant = this.workspace.session.tenant;
		return (this.resource.data?.roles ?? []).filter(
			(role) => role.id === current || !tenant || roleAvailable(role, tenant),
		);
	}

	/** The visits a person still has ahead, which need someone else when they leave. */
	futureVisits(member: Member): Appointment[] {
		return (this.context.data?.visits ?? [])
			.filter((visit) => visit.assigneeId === member.user.id)
			.sort((left, right) => left.start.localeCompare(right.start));
	}

	/** The last changes to memberships and invitations, newest first. */
	get recent(): AuditEntry[] {
		return (this.context.data?.log ?? []).slice(0, 5);
	}

	/** The name behind an audit target: a membership resolves to its person. */
	targetName(entry: AuditEntry): string {
		const member = this.resource.data?.members.find((row) => row.membership.id === entry.target.id);
		return member ? `${member.user.firstName} ${member.user.lastName}` : entry.target.label;
	}

	async invite(): Promise<boolean> {
		const roleId = (this.inviteRole || this.resource.data?.roles.find((role) => role.kind === 'user')?.id) as RoleId;
		const created = await this.attempt(
			() => this.workspace.account.invite(this.inviteEmail, roleId),
			'ui.ws.team.invited',
		);
		if (created) {
			this.inviteEmail = '';
			return true;
		}
		return false;
	}

	changeRole(id: MembershipId, roleId: RoleId) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { roleId }), {
			success: 'ui.ws.team.role_changed',
		});
	}

	/** Deactivating also signs the person out; their future visits can go back to the open visits. */
	deactivate(id: MembershipId, releaseVisits: boolean) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { status: 'inactive', releaseVisits }), {
			success: 'ui.ws.team.deactivated',
		});
	}

	reactivate(id: MembershipId) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { status: 'active' }), {
			success: 'ui.ws.team.reactivated',
		});
	}

	signOut(id: MembershipId) {
		return this.workspace.run(() => this.workspace.account.signOutMember(id), {
			success: 'ui.ws.team.signed_out',
		});
	}

	setJobTitle(id: MembershipId, jobTitle: string) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { jobTitle }));
	}

	resend(id: InvitationId) {
		return this.workspace.run(() => this.workspace.account.resendInvitation(id), { success: 'ui.ws.team.resent' });
	}

	revoke(id: InvitationId) {
		return this.workspace.run(() => this.workspace.account.revokeInvitation(id), { success: 'ui.ws.team.revoked' });
	}
}
