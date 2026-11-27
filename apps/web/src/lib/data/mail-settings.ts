import type { MailDomainView, MailSenderInput, MailSenderView, MailSettingsView } from '@clinks/contracts/mail';
import type { DomainPurpose } from '@clinks/domain/mail-domains';
import type { AppointmentMailSettings } from '@clinks/domain/appointment-mail';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/** Settings › E-Mail: sender domains and addresses, through the API or the demo's stand-in. */
export class MailSettings {
	readonly #client: ApiClient | null;
	readonly #api: () => WorkspaceApi;
	constructor(client: ApiClient | null, api: () => WorkspaceApi) {
		this.#client = client;
		this.#api = api;
	}

	/** True in the demo: «Prüfen» does not look into DNS there. */
	get demo() {
		return this.#client === null;
	}

	settings(): Promise<MailSettingsView> {
		return this.#client
			? this.#client.request<MailSettingsView>('GET', '/mail/settings')
			: this.#api().mailSettings.settings();
	}

	addDomain(input: { domain: string; purpose: DomainPurpose }): Promise<MailDomainView> {
		return this.#client
			? this.#client.request<MailDomainView>('POST', '/mail/domains', input)
			: this.#api().mailSettings.addDomain(input);
	}

	checkDomain(id: string): Promise<MailDomainView> {
		return this.#client
			? this.#client.request<MailDomainView>('POST', `/mail/domains/${id}/check`, {})
			: this.#api().mailSettings.checkDomain(id);
	}

	removeDomain(id: string): Promise<void> {
		return this.#client
			? this.#client.request<void>('DELETE', `/mail/domains/${id}`)
			: this.#api().mailSettings.removeDomain(id);
	}

	saveSender(id: string | null, input: MailSenderInput): Promise<MailSenderView> {
		return this.#client
			? this.#client.request<MailSenderView>('POST', id ? `/mail/senders/${id}` : '/mail/senders', input)
			: this.#api().mailSettings.saveSender(id, input);
	}

	rotateFilingAddress(): Promise<MailSettingsView> {
		return this.#client
			? this.#client.request<MailSettingsView>('POST', '/mail/filing-address', {})
			: this.#api().mailSettings.rotateFilingAddress();
	}

	removeSender(id: string): Promise<void> {
		return this.#client
			? this.#client.request<void>('DELETE', `/mail/senders/${id}`)
			: this.#api().mailSettings.removeSender(id);
	}

	appointmentMail(): Promise<AppointmentMailSettings> {
		return this.#client
			? this.#client.request<AppointmentMailSettings>('GET', '/mail/appointment-settings')
			: this.#api().mailSettings.appointmentMail();
	}

	saveAppointmentMail(input: AppointmentMailSettings): Promise<void> {
		return this.#client
			? this.#client.request<void>('POST', '/mail/appointment-settings', input)
			: this.#api().mailSettings.saveAppointmentMail(input);
	}
}
