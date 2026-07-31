import type { ClinksClient } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';
import { InvitationViewModel } from './invitation-view-model.svelte.ts';
import { LocalizationViewModel } from './localization-view-model.svelte.ts';
import { SystemStatsViewModel } from './system-stats-view-model.svelte.ts';
import { TenantViewModel } from './tenant-view-model.svelte.ts';
import { UserManagementViewModel } from './user-management-view-model.svelte.ts';
import { AuditLogViewModel } from './audit-log-view-model.svelte.ts';
import type { SessionStore } from './session-store.svelte.ts';

export class AdminDashboardViewModel {
	errorMessage = $state('');

	readonly tenantModel: TenantViewModel;
	readonly localizationModel: LocalizationViewModel;
	readonly auditLogModel: AuditLogViewModel;
	readonly userModel: UserManagementViewModel;
	readonly invitationModel: InvitationViewModel;
	readonly statsModel: SystemStatsViewModel;

	#session: Pick<SessionStore, 'current'>;

	constructor(
		client: ClinksClient,
		session: Pick<SessionStore, 'current'>,
		messages: ErrorMessageFormatter,
		refreshTranslations: () => Promise<void>,
		locale: () => string,
	) {
		this.#session = session;

		this.tenantModel = new TenantViewModel(client, messages);
		this.localizationModel = new LocalizationViewModel(client, messages, refreshTranslations, locale);
		this.auditLogModel = new AuditLogViewModel(client, messages);
		this.userModel = new UserManagementViewModel(client);
		this.invitationModel = new InvitationViewModel(client);
		this.statsModel = new SystemStatsViewModel(client);
	}

	async loadSection(section: string) {
		const key = section === 'dashboard' ? 'overview' : section;
		switch (key) {
			case 'tenants':
				if (!this.tenantModel.tenants.loaded) await this.tenantModel.load();
				break;
			case 'localization':
				if (!this.localizationModel.languages.loaded) await this.localizationModel.load();
				break;
			case 'audit':
				if (this.auditLogModel.auditEvents.length === 0) await this.auditLogModel.filterAuditEvents();
				break;
			case 'users':
				if (this.userModel.list.items.length === 0) await this.userModel.load();
				break;
			case 'invites':
				if (this.invitationModel.list.items.length === 0) await this.invitationModel.load();
				break;
			case 'overview':
				if (!this.statsModel.stats.loaded) await this.statsModel.load();
				break;
		}
	}

	get isSuperAdministrator() {
		return this.#session.current?.user.isSuperAdmin ?? false;
	}

	get sessionEmail() {
		return this.#session.current?.user.email ?? '';
	}
}
