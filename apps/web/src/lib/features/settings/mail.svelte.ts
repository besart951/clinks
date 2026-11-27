import type { MailSenderInput, MailSenderView, MailSettingsView } from '@clinks/contracts/mail';
import type { DomainPurpose, SenderKind } from '@clinks/domain/mail-domains';
import type { Member } from '../../data/account-api.ts';
import { MockApiError } from '../../data/database.ts';
import { toast } from 'svelte-sonner';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** The sender dialog's fields; `id` null for a new sender. */
export interface SenderDraft extends MailSenderInput {
	id: string | null;
}

/** Settings › E-Mail: sender domains with their DNS records, and the addresses mail goes out from. */
export class MailSettingsModel {
	readonly resource: Resource<{ settings: MailSettingsView; members: Member[] }>;
	domain = $state('');
	purpose = $state<DomainPurpose>('business');
	domainError = $state('');
	draft = $state<SenderDraft | null>(null);
	draftErrors = $state<Record<string, string>>({});
	busy = $state(false);
	readonly #workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['mailDomains', 'mailSenders', 'mailFilingAddresses'], async () => {
			const [settings, team] = await Promise.all([
				workspace.mailSettings.settings(),
				workspace.account.members().catch(() => ({ members: [] as Member[] })),
			]);
			return { settings, members: team.members };
		});
	}

	get demo() {
		return this.#workspace.mailSettings.demo;
	}

	async addDomain() {
		this.domainError = '';
		const added = await this.#run(() =>
			this.#workspace.mailSettings.addDomain({ domain: this.domain, purpose: this.purpose }),
		);
		if (added) this.domain = '';
	}

	checkDomain(id: string) {
		return this.#run(() => this.#workspace.mailSettings.checkDomain(id), 'ui.ws.mail_settings.checked');
	}

	removeDomain(id: string) {
		return this.#run(() => this.#workspace.mailSettings.removeDomain(id), 'ui.ws.mail_settings.domain_removed');
	}

	newSender(kind: SenderKind) {
		const tenant = this.#workspace.session.tenant;
		this.draftErrors = {};
		this.draft = {
			id: null,
			kind,
			address: '',
			displayName: tenant?.name ?? '',
			replyTo: null,
			userId: kind === 'personal' ? (this.#workspace.session.user?.id ?? null) : null,
			signature: '',
			isDefault: kind !== 'personal',
		};
	}

	editSender(sender: MailSenderView) {
		const { active: _active, domainId: _domain, ...fields } = sender;
		this.draftErrors = {};
		this.draft = { ...fields };
	}

	async saveSender() {
		if (!this.draft) return;
		const { id, ...input } = $state.snapshot(this.draft);
		this.busy = true;
		try {
			await this.#workspace.mailSettings.saveSender(id, { ...input, replyTo: input.replyTo || null });
			this.draft = null;
			await this.resource.reload(true);
		} catch (error) {
			this.draftErrors = error instanceof MockApiError ? error.fields : {};
			if (!Object.keys(this.draftErrors).length) toast.error(this.#workspace.message(error));
		} finally {
			this.busy = false;
		}
	}

	removeSender(id: string) {
		return this.#run(() => this.#workspace.mailSettings.removeSender(id), 'ui.ws.mail_settings.sender_removed');
	}

	rotateFilingAddress() {
		return this.#run(() => this.#workspace.mailSettings.rotateFilingAddress(), 'ui.ws.mail_settings.filing_rotated');
	}

	copy(text: string) {
		return this.#workspace.run(() => this.#workspace.platform.files.copyText(text), {
			success: 'ui.ws.mail_settings.copied',
		});
	}

	async #run<T>(action: () => Promise<T>, success?: string) {
		this.busy = true;
		try {
			const result = await action();
			if (success) toast.success(this.#workspace.t(success));
			await this.resource.reload(true);
			return result;
		} catch (error) {
			if (error instanceof MockApiError && error.fields.domain) this.domainError = error.fields.domain;
			else toast.error(this.#workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}
}
