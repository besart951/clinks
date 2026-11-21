import { toast } from 'svelte-sonner';
import type { InvitationId, MembershipId, RoleId, SessionId } from '../../domain/ids.ts';
import type { BrowserSession, Invitation, ModuleKey, NotificationPreferences, Permission, PlanCode, Role, Tenant } from '../../domain/types.ts';
import type { Member, PlatformInvoice } from '../../data/account-api.ts';
import type { Locale } from '../../i18n/catalog.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { maxUploadBytes, readAsDataUrl } from '../collaboration/attachments.svelte.ts';

abstract class SettingsForm {
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	protected workspace: Workspace;

	constructor(workspace: Workspace) {
		this.workspace = workspace;
	}

	protected async attempt<T>(action: () => Promise<T>, success?: string): Promise<T | null> {
		this.busy = true;
		this.fields = {};
		try {
			const result = await action();
			if (success) toast.success(this.workspace.t(success));
			return result;
		} catch (error) {
			this.fields = this.workspace.fieldErrors(error);
			toast.error(this.workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}
}

type CompanyFields = Pick<Tenant, 'name' | 'address' | 'vatNumber' | 'iban' | 'brandColor' | 'logoDataUrl' | 'locale' | 'timeZone'>;

export class CompanySettingsModel extends SettingsForm {
	value = $state<CompanyFields>({ name: '', address: { street: '', zip: '', city: '' }, vatNumber: '', iban: '', brandColor: '#0f766e', logoDataUrl: null, locale: 'de-CH', timeZone: 'Europe/Zurich' });
	#initial = $state('');
	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	load() {
		const tenant = this.workspace.session.tenant;
		if (!tenant) return;
		this.value = structuredClone({ name: tenant.name, address: tenant.address, vatNumber: tenant.vatNumber, iban: tenant.iban, brandColor: tenant.brandColor, logoDataUrl: tenant.logoDataUrl, locale: tenant.locale, timeZone: tenant.timeZone });
		this.#initial = JSON.stringify(this.value);
	}

	async setLogo(file: File | undefined) {
		if (!file) return;
		if (file.size > maxUploadBytes) {
			toast.error(this.workspace.t('error.ws.file_too_large'));
			return;
		}
		this.value.logoDataUrl = await readAsDataUrl(file);
	}

	async save() {
		const saved = await this.attempt(() => this.workspace.account.updateTenant($state.snapshot(this.value)), 'ui.ws.settings.saved');
		if (saved) {
			await this.workspace.session.refresh();
			this.load();
		}
	}
}

export class ProfileModel extends SettingsForm {
	firstName = $state('');
	lastName = $state('');
	email = $state('');
	avatarDataUrl = $state<string | null>(null);
	preferences = $state<NotificationPreferences>({ inApp: true, email: true, push: false, digest: 'daily' });
	currentPassword = $state('');
	newPassword = $state('');
	twoFactorCode = $state('');
	readonly sessions: Resource<BrowserSession[]>;

	constructor(workspace: Workspace) {
		super(workspace);
		this.sessions = new Resource(workspace.db, ['sessions'], () => workspace.account.sessions());
	}

	load() {
		const user = this.workspace.session.user;
		if (!user) return;
		this.firstName = user.firstName;
		this.lastName = user.lastName;
		this.email = user.email;
		this.avatarDataUrl = user.avatarDataUrl;
		this.preferences = { ...user.notificationPreferences };
	}

	async setAvatar(file: File | undefined) {
		if (!file) return;
		if (file.size > maxUploadBytes) {
			toast.error(this.workspace.t('error.ws.file_too_large'));
			return;
		}
		this.avatarDataUrl = await readAsDataUrl(file);
	}

	async save() {
		const saved = await this.attempt(
			() => this.workspace.account.updateProfile({ firstName: this.firstName, lastName: this.lastName, email: this.email, avatarDataUrl: this.avatarDataUrl, notificationPreferences: $state.snapshot(this.preferences) }),
			'ui.ws.settings.saved',
		);
		if (saved) await this.workspace.session.refresh();
	}

	async setLocale(locale: Locale) {
		this.workspace.i18n.setLocale(locale);
		await this.workspace.account.updateProfile({ locale }).catch(() => undefined);
	}

	async changePassword() {
		const ok = await this.attempt(() => this.workspace.account.changePassword(this.currentPassword, this.newPassword), 'ui.ws.settings.password_changed');
		if (ok !== null) {
			this.currentPassword = '';
			this.newPassword = '';
		}
	}

	async setTwoFactor(enabled: boolean) {
		const saved = await this.attempt(() => this.workspace.account.setTwoFactor(enabled, this.twoFactorCode), enabled ? 'ui.ws.settings.two_factor_enabled' : 'ui.ws.settings.two_factor_disabled');
		if (saved) {
			this.twoFactorCode = '';
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	async revoke(id: SessionId) {
		await this.workspace.run(() => this.workspace.account.revokeSession(id), { success: 'ui.ws.settings.session_revoked' });
	}
}

export class TeamModel extends SettingsForm {
	readonly resource: Resource<{ members: Member[]; invitations: Invitation[]; roles: Role[] }>;
	inviteEmail = $state('');
	inviteRole = $state<RoleId | ''>('');
	search = $state('');

	constructor(workspace: Workspace) {
		super(workspace);
		this.resource = new Resource(workspace.db, ['memberships', 'invitations', 'roles', 'users'], () => workspace.account.members());
	}

	get members(): Member[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data?.members ?? [])
			.filter((member) => !query || `${member.user.firstName} ${member.user.lastName} ${member.user.email}`.toLowerCase().includes(query))
			.sort((left, right) => Number(right.membership.status === 'active') - Number(left.membership.status === 'active') || left.user.lastName.localeCompare(right.user.lastName));
	}

	async invite(): Promise<boolean> {
		const roleId = (this.inviteRole || this.resource.data?.roles.find((role) => role.kind === 'user')?.id) as RoleId;
		const created = await this.attempt(() => this.workspace.account.invite(this.inviteEmail, roleId), 'ui.ws.team.invited');
		if (created) {
			this.inviteEmail = '';
			return true;
		}
		return false;
	}

	changeRole(id: MembershipId, roleId: RoleId) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { roleId }), { success: 'ui.ws.team.role_changed' });
	}

	setActive(id: MembershipId, active: boolean) {
		return this.workspace.run(() => this.workspace.account.changeMember(id, { status: active ? 'active' : 'inactive' }), {
			success: active ? 'ui.ws.team.reactivated' : 'ui.ws.team.deactivated',
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

	usage(roleId: RoleId) {
		return (this.resource.data?.members ?? []).filter((member) => member.role.id === roleId && member.membership.status === 'active').length;
	}

	edit(role: Role | null) {
		this.editing = role ? { id: role.id, name: role.name, permissions: [...role.permissions] } : { id: null, name: '', permissions: ['contacts.read', 'calendar.read'] };
		this.fields = {};
	}

	toggle(permission: Permission) {
		if (!this.editing) return;
		const has = this.editing.permissions.includes(permission);
		this.editing.permissions = has ? this.editing.permissions.filter((candidate) => candidate !== permission) : [...this.editing.permissions, permission];
		if (!has && permission.endsWith('.write')) {
			const read = permission.replace('.write', '.read') as Permission;
			if (!this.editing.permissions.includes(read)) this.editing.permissions = [...this.editing.permissions, read];
		}
	}

	async save(): Promise<boolean> {
		if (!this.editing) return false;
		const saved = await this.attempt(() => this.workspace.account.saveRole($state.snapshot(this.editing!)), 'ui.ws.roles.saved');
		if (saved) {
			this.editing = null;
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	remove(role: Role) {
		return this.workspace.run(() => this.workspace.account.deleteRole(role.id), { success: 'ui.ws.roles.deleted' });
	}
}

export class BillingModel extends SettingsForm {
	readonly history: Resource<PlatformInvoice[]>;
	cycle = $state<'monthly' | 'yearly'>('monthly');
	cardNumber = $state('');
	cardExpires = $state('');

	constructor(workspace: Workspace) {
		super(workspace);
		this.history = new Resource(workspace.db, ['tenants'], () => workspace.account.billingHistory());
		this.cycle = workspace.session.tenant?.billingCycle ?? 'monthly';
	}

	async choosePlan(plan: PlanCode) {
		const saved = await this.attempt(() => this.workspace.account.changePlan(plan, this.cycle), 'ui.ws.billing.plan_changed');
		if (saved) await this.workspace.session.refresh();
	}

	async toggleModule(module: ModuleKey, enabled: boolean) {
		const tenant = this.workspace.session.tenant!;
		const enabledModules = enabled ? [...new Set([...tenant.enabledModules, module])] : tenant.enabledModules.filter((candidate) => candidate !== module);
		const saved = await this.attempt(() => this.workspace.account.updateTenant({ enabledModules }), enabled ? 'ui.ws.billing.module_enabled' : 'ui.ws.billing.module_disabled');
		if (saved) await this.workspace.session.refresh();
	}

	async savePaymentMethod(): Promise<boolean> {
		const saved = await this.attempt(() => this.workspace.account.updatePaymentMethod({ number: this.cardNumber, expires: this.cardExpires }), 'ui.ws.billing.card_saved');
		if (saved) {
			this.cardNumber = '';
			this.cardExpires = '';
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	async cancel() {
		if (await this.attempt(() => this.workspace.account.cancelSubscription(), 'ui.ws.billing.cancelled')) await this.workspace.session.refresh();
	}

	async resume() {
		if (await this.attempt(() => this.workspace.account.resumeSubscription(), 'ui.ws.billing.resumed')) await this.workspace.session.refresh();
	}
}

export class PrivacyModel extends SettingsForm {
	password = $state('');

	async exportData() {
		const data = await this.attempt(() => this.workspace.account.exportTenantData(), 'ui.ws.privacy.exported');
		if (!data) return;
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `clinks-export-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(link.href);
	}

	async deleteAccount(): Promise<boolean> {
		const ok = await this.attempt(() => this.workspace.account.deleteAccount(this.password), 'ui.ws.privacy.deleted');
		if (ok !== null) this.workspace.session.signOut();
		return ok !== null;
	}
}
