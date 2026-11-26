import { RemoteAuthGateway } from '../../session/remote-auth.ts';
import type { InlineFieldSpec } from '@clinks/ui/kit/inline-edit';
import { isQrIban, isValidSwissIban } from '@clinks/domain/qr-bill';
import type { InvoiceSettings } from '@clinks/domain/invoicing';
import { toast } from 'svelte-sonner';
import type { SessionId } from '@clinks/domain/ids';
import type { BrowserSession, ModuleKey, NotificationPreferences, PlanCode, Tenant } from '@clinks/domain/types';
import type { PlatformInvoice } from '../../data/account-api.ts';
import type { Locale } from '@clinks/i18n-types/catalog';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { maxUploadBytes } from '../collaboration/attachments.svelte.ts';

export abstract class SettingsForm {
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

/** Company settings edited in place: every row saves on its own, with undo. */
export class CompanySettingsModel {
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	fields(tenant: Tenant): InlineFieldSpec[] {
		const t = (key: string) => this.#workspace.t(key);
		return [
			{
				key: 'name',
				label: t('ui.ws.settings.tenant_name'),
				value: tenant.name,
				validate: (value) => (value ? null : t('ui.ws.inline.required')),
			},
			{ key: 'street', label: t('ui.ws.settings.street'), value: tenant.address.street },
			{ key: 'houseNumber', label: t('ui.ws.field.house_number'), value: tenant.address.houseNumber ?? '' },
			{ key: 'zip', label: t('ui.ws.field.zip'), value: tenant.address.zip },
			{ key: 'city', label: t('ui.ws.field.city'), value: tenant.address.city },
			{ key: 'vatNumber', label: t('ui.ws.settings.vat_number'), value: tenant.vatNumber, mono: true },
			{
				key: 'iban',
				label: t('ui.ws.settings.iban'),
				value: tenant.iban,
				mono: true,
				validate: (value) =>
					value === '' || (isValidSwissIban(value) && !isQrIban(value)) ? null : t('ui.ws.settings.iban_invalid'),
			},
			{
				key: 'qrIban',
				label: t('ui.ws.settings.qr_iban'),
				value: tenant.qrIban,
				mono: true,
				validate: (value) => (value === '' || isQrIban(value) ? null : t('ui.ws.settings.qr_iban_invalid')),
			},
		];
	}

	/** Payment term, footer and delivery of the workspace's invoices; saved under `invoiceSettings`. */
	invoiceFields(tenant: Tenant): InlineFieldSpec[] {
		const t = (key: string) => this.#workspace.t(key);
		const settings = tenant.invoiceSettings;
		return [
			{
				key: 'invoice.paymentTermDays',
				label: t('ui.ws.settings.payment_term'),
				value: String(settings.paymentTermDays),
				mono: true,
				validate: (value) =>
					/^\d{1,3}$/.test(value) && Number(value) <= 120 ? null : t('ui.ws.settings.payment_term_invalid'),
			},
			{
				key: 'invoice.delivery',
				label: t('ui.ws.settings.delivery'),
				value: settings.delivery,
				kind: 'select',
				options: (['auto', 'attachment', 'link'] as const).map((value) => ({
					value,
					label: t(`ui.ws.settings.delivery_${value}`),
				})),
			},
			{
				key: 'invoice.replyTo',
				label: t('ui.ws.settings.reply_to'),
				value: settings.replyTo ?? '',
				display: settings.replyTo || t('ui.ws.settings.reply_to_sender'),
				validate: (value) =>
					value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : t('ui.ws.settings.reply_to_invalid'),
			},
			{ key: 'invoice.footer', label: t('ui.ws.settings.invoice_footer'), value: settings.footer },
		];
	}

	/** Three reminder levels: the days each gives to pay, its fee and an own text; default interest on or off. */
	reminderFields(tenant: Tenant): InlineFieldSpec[] {
		const t = (key: string, params?: { [name: string]: string | number }) => this.#workspace.t(key, params);
		const settings = tenant.invoiceSettings;
		const levels = settings.reminders.flatMap((step, index): InlineFieldSpec[] => {
			const level = index + 1;
			return [
				{
					key: `reminder.${index}.days`,
					label: t('ui.ws.settings.reminder_days', { level }),
					value: String(step.days),
					mono: true,
					validate: (value) =>
						/^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 90
							? null
							: t('ui.ws.settings.reminder_days_invalid'),
				},
				{
					key: `reminder.${index}.fee`,
					label: t('ui.ws.settings.reminder_fee', { level }),
					value: (step.fee / 100).toFixed(2),
					display: step.fee > 0 ? this.#workspace.i18n.money(step.fee) : t('ui.ws.settings.reminder_no_fee'),
					mono: true,
					validate: (value) =>
						/^\d{1,3}([.,]\d{1,2})?$/.test(value.trim()) ? null : t('ui.ws.settings.reminder_fee_invalid'),
				},
				{
					key: `reminder.${index}.text`,
					label: t('ui.ws.settings.reminder_text', { level }),
					value: step.text,
					kind: 'textarea',
					display: step.text || t('ui.ws.settings.reminder_default_text'),
				},
			];
		});
		return [
			...levels,
			{
				key: 'invoice.defaultInterest',
				label: t('ui.ws.settings.default_interest'),
				value: settings.defaultInterest ? 'on' : 'off',
				kind: 'select',
				options: [
					{ value: 'off', label: t('ui.ws.settings.default_interest_off') },
					{ value: 'on', label: t('ui.ws.settings.default_interest_on') },
				],
			},
		];
	}

	regionalFields(tenant: Tenant): InlineFieldSpec[] {
		const t = (key: string) => this.#workspace.t(key);
		return [
			{
				key: 'locale',
				label: t('ui.ws.settings.default_language'),
				value: tenant.locale,
				kind: 'select',
				options: [
					{ value: 'de-CH', label: 'Deutsch (Schweiz)' },
					{ value: 'en-US', label: 'English (US)' },
				],
			},
			{
				key: 'timeZone',
				label: t('ui.ws.settings.time_zone'),
				value: tenant.timeZone,
				kind: 'select',
				options: ['Europe/Zurich', 'Europe/Berlin', 'Europe/Vienna'].map((zone) => ({ value: zone, label: zone })),
			},
		];
	}

	saveField(field: InlineFieldSpec, value: string) {
		const tenant = this.#workspace.session.tenant!;
		if (field.key.startsWith('invoice.') || field.key.startsWith('reminder.')) {
			// A plain copy: the session's tenant is reactive state, which storage cannot clone.
			const previous = $state.snapshot(tenant.invoiceSettings) as Tenant['invoiceSettings'];
			const invoiceSettings = invoiceSettingsWith(previous, field.key, value);
			return this.#apply({ invoiceSettings }, { invoiceSettings: previous }, field.label);
		}
		const address = ['street', 'houseNumber', 'zip', 'city'].includes(field.key);
		const patch: Partial<Tenant> = address
			? { address: { ...tenant.address, [field.key]: value } }
			: { [field.key]: value };
		const previous: Partial<Tenant> = address
			? { address: tenant.address }
			: { [field.key]: tenant[field.key as keyof Tenant] };
		return this.#apply(patch, previous, field.label);
	}

	setBrandColor(color: string) {
		const tenant = this.#workspace.session.tenant!;
		return this.#apply(
			{ brandColor: color },
			{ brandColor: tenant.brandColor },
			this.#workspace.t('ui.ws.settings.brand_color'),
		);
	}

	async setLogo(file: File | undefined) {
		if (!file) return;
		if (file.size > maxUploadBytes) {
			toast.error(this.#workspace.t('error.ws.file_too_large'));
			return;
		}
		const tenant = this.#workspace.session.tenant!;
		await this.#apply(
			{ logoDataUrl: await this.#workspace.platform.files.readAsDataUrl(file) },
			{ logoDataUrl: tenant.logoDataUrl },
			this.#workspace.t('ui.ws.settings.logo'),
		);
	}

	removeLogo() {
		const tenant = this.#workspace.session.tenant!;
		return this.#apply(
			{ logoDataUrl: null },
			{ logoDataUrl: tenant.logoDataUrl },
			this.#workspace.t('ui.ws.settings.logo'),
		);
	}

	async #apply(patch: Partial<Tenant>, previous: Partial<Tenant>, label: string) {
		const { account, session } = this.#workspace;
		const saved = await this.#workspace.run(() => account.updateTenant(patch), {
			success: 'ui.ws.inline.saved',
			successParams: { field: label },
			undo: async () => {
				await account.updateTenant(previous);
				await session.refresh();
			},
		});
		if (saved) await session.refresh();
		return saved;
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
	twoFactorPassword = $state('');
	twoFactorSecret = $state('');
	recoveryCodes = $state<string[]>([]);
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
		this.avatarDataUrl = await this.workspace.platform.files.readAsDataUrl(file);
	}

	async save() {
		const saved = await this.attempt(
			() =>
				this.workspace.account.updateProfile({
					firstName: this.firstName,
					lastName: this.lastName,
					email: this.email,
					avatarDataUrl: this.avatarDataUrl,
					notificationPreferences: $state.snapshot(this.preferences),
				}),
			'ui.ws.settings.saved',
		);
		if (saved) await this.workspace.session.refresh();
	}

	async setLocale(locale: Locale) {
		this.workspace.i18n.setLocale(locale);
		await this.workspace.account.updateProfile({ locale }).catch(() => undefined);
	}

	async changePassword() {
		const ok = await this.attempt(
			() => this.workspace.account.changePassword(this.currentPassword, this.newPassword),
			'ui.ws.settings.password_changed',
		);
		if (ok !== null) {
			this.currentPassword = '';
			this.newPassword = '';
		}
	}

	async startTwoFactor() {
		const client = this.workspace.remote;
		if (!client) return true;
		const result = await this.attempt(() => client.request<{ secret: string }>('POST', '/me/two-factor/setup'));
		this.twoFactorSecret = result?.secret ?? '';
		return Boolean(result);
	}
	async setTwoFactor(enabled: boolean) {
		const client = this.workspace.remote;
		if (client) {
			const saved = await this.attempt(
				async () => {
					if (enabled)
						this.recoveryCodes = (
							await client.request<{ recoveryCodes: string[] }>('POST', '/me/two-factor/enable', {
								code: this.twoFactorCode,
							})
						).recoveryCodes;
					else
						await client.request('POST', '/me/two-factor/disable', {
							code: this.twoFactorCode,
							password: this.twoFactorPassword,
						});
					const auth = this.workspace.auth;
					if (auth instanceof RemoteAuthGateway) await auth.loadAccount();
					await this.workspace.session.refresh();
					this.twoFactorSecret = '';
					this.twoFactorCode = '';
					this.twoFactorPassword = '';
					return true;
				},
				enabled ? 'ui.ws.settings.two_factor_enabled' : 'ui.ws.settings.two_factor_disabled',
			);
			return Boolean(saved);
		}
		const saved = await this.attempt(
			() => this.workspace.account.setTwoFactor(enabled, this.twoFactorCode),
			enabled ? 'ui.ws.settings.two_factor_enabled' : 'ui.ws.settings.two_factor_disabled',
		);
		if (saved) {
			this.twoFactorCode = '';
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	async revoke(id: SessionId) {
		await this.workspace.run(() => this.workspace.account.revokeSession(id), {
			success: 'ui.ws.settings.session_revoked',
		});
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

	async openBilling(input?: { plan: PlanCode; cycle: 'monthly' | 'yearly' }) {
		const client = this.workspace.remote;
		if (!client) return;
		const result = await this.attempt(() =>
			client.request<{ url: string }>('POST', input ? '/billing/checkout' : '/billing/portal', input),
		);
		if (result) location.assign(result.url);
	}
	async choosePlan(plan: PlanCode) {
		if (this.workspace.remote) return this.openBilling({ plan, cycle: this.cycle });
		const saved = await this.attempt(
			() => this.workspace.account.changePlan(plan, this.cycle),
			'ui.ws.billing.plan_changed',
		);
		if (saved) await this.workspace.session.refresh();
	}

	async toggleModule(module: ModuleKey, enabled: boolean) {
		const tenant = this.workspace.session.tenant!;
		const enabledModules = enabled
			? [...new Set([...tenant.enabledModules, module])]
			: tenant.enabledModules.filter((candidate) => candidate !== module);
		const saved = await this.attempt(
			() => this.workspace.account.updateTenant({ enabledModules }),
			enabled ? 'ui.ws.billing.module_enabled' : 'ui.ws.billing.module_disabled',
		);
		if (saved) await this.workspace.session.refresh();
	}

	async savePaymentMethod(): Promise<boolean> {
		const saved = await this.attempt(
			() => this.workspace.account.updatePaymentMethod({ number: this.cardNumber, expires: this.cardExpires }),
			'ui.ws.billing.card_saved',
		);
		if (saved) {
			this.cardNumber = '';
			this.cardExpires = '';
			await this.workspace.session.refresh();
		}
		return saved !== null;
	}

	async cancel() {
		if (await this.attempt(() => this.workspace.account.cancelSubscription(), 'ui.ws.billing.cancelled'))
			await this.workspace.session.refresh();
	}

	async resume() {
		if (await this.attempt(() => this.workspace.account.resumeSubscription(), 'ui.ws.billing.resumed'))
			await this.workspace.session.refresh();
	}
}

export class PrivacyModel extends SettingsForm {
	password = $state('');

	async exportData() {
		const data = await this.attempt(async () => {
			const exported = await this.workspace.api.exportTenantData(await this.workspace.account.exportTenantData());
			const finance = this.workspace.session.can('finance.read') ? await this.workspace.bankImports.exportAll() : {};
			return { ...exported, ...finance };
		}, 'ui.ws.privacy.exported');
		if (!data) return;
		this.workspace.platform.files.save(
			new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
			`clinks-export-${new Date().toISOString().slice(0, 10)}.json`,
		);
	}

	async deleteAccount(): Promise<boolean> {
		const ok = await this.attempt(() => this.workspace.account.deleteAccount(this.password), 'ui.ws.privacy.deleted');
		if (ok !== null) this.workspace.session.signOut();
		return ok !== null;
	}
}

/** The invoice settings with one field changed: `invoice.<setting>` or `reminder.<level index>.<days|fee|text>`. */
function invoiceSettingsWith(previous: InvoiceSettings, key: string, value: string): InvoiceSettings {
	const [scope, first, second] = key.split('.');
	if (scope === 'reminder') {
		const index = Number(first);
		const reminders = previous.reminders.map((step, at) => {
			if (at !== index) return step;
			if (second === 'days') return { ...step, days: Number(value) };
			if (second === 'fee') return { ...step, fee: Math.round(Number(value.trim().replace(',', '.')) * 100) };
			return { ...step, text: value.trim() };
		});
		return { ...previous, reminders };
	}
	if (first === 'paymentTermDays') return { ...previous, paymentTermDays: Number(value) };
	if (first === 'defaultInterest') return { ...previous, defaultInterest: value === 'on' };
	return { ...previous, [first]: value };
}
