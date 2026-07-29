import type { ClinksClient, Session } from '@clinks/api-client';
import { AuditLogViewModel } from './audit-log-view-model.svelte.ts';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';
import { LocalizationViewModel } from './localization-view-model.svelte.ts';
import { TenantViewModel } from './tenant-view-model.svelte.ts';

export class AdminDashboardViewModel {
	session = $state<Session | null>(null);
	email = $state('');
	password = $state('');
	busy = $state(false);
	errorMessage = $state('');

	readonly tenantModel: TenantViewModel;
	readonly localizationModel: LocalizationViewModel;
	readonly auditLogModel: AuditLogViewModel;

	#client: Pick<
		ClinksClient,
		| 'adminLanguages'
		| 'adminLogin'
		| 'auditEvents'
		| 'createTenant'
		| 'getSession'
		| 'logout'
		| 'saveTranslation'
		| 'tenants'
	>;
	#messages: ErrorMessageFormatter;

	constructor(
		client: Pick<
			ClinksClient,
			| 'adminLanguages'
			| 'adminLogin'
			| 'auditEvents'
			| 'createTenant'
			| 'getSession'
			| 'logout'
			| 'saveTranslation'
			| 'tenants'
		>,
		messages: ErrorMessageFormatter,
		refreshTranslations: () => Promise<void>,
		locale: () => string,
	) {
		this.#client = client;
		this.#messages = messages;

		const setError = (msg: string) => {
			this.errorMessage = msg;
		};
		this.tenantModel = new TenantViewModel(this.#client, this.#messages, setError);
		this.localizationModel = new LocalizationViewModel(
			this.#client,
			this.#messages,
			refreshTranslations,
			locale,
			setError,
		);
		this.auditLogModel = new AuditLogViewModel(this.#client, this.#messages, setError);
	}

	async initialize() {
		try {
			this.session = await this.#client.getSession();
			if (this.isSuperAdministrator) await this.loadDashboard();
		} catch {
			this.session = null;
		}
	}

	async login() {
		this.busy = true;
		this.errorMessage = '';
		try {
			this.session = await this.#client.adminLogin(this.email, this.password);
			await this.loadDashboard();
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		} finally {
			this.busy = false;
		}
	}

	async signOut() {
		try {
			await this.#client.logout();
		} finally {
			this.session = null;
			this.tenantModel.clear();
			this.localizationModel.clear();
			this.auditLogModel.clear();
		}
	}

	get isSuperAdministrator() {
		return this.session?.user.isSuperAdmin ?? false;
	}

	get sessionEmail() {
		return this.session?.user.email ?? '';
	}

	private async loadDashboard() {
		await Promise.all([this.tenantModel.load(), this.localizationModel.load(), this.auditLogModel.load()]);
	}
}
