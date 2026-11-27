import {
	mailDomainView,
	type MailDomainView,
	type MailSenderInput,
	type MailSenderView,
	type MailSettingsView,
} from '@clinks/contracts/mail';
import { newId } from '@clinks/domain/ids';
import { expectedRecords, normalizeDomain, senderFits, type DomainPurpose } from '@clinks/domain/mail-domains';
import { defaultAppointmentMail, type AppointmentMailSettings } from '@clinks/domain/appointment-mail';
import { MockApiError, type MockMailDomain, type MockMailSender, type WorkspaceCache } from './database.ts';
import type { RequestContext } from './repository.ts';

/** The SPF include and inbound domain the demo shows; the API's come from MAIL_SPF_INCLUDE and INBOUND_DOMAIN. */
export const demoSpfInclude = '_spf.clinks.ch';
const demoInboundDomain = 'in.clinks.ch';

/**
 * The demo's stand-in for Settings › E-Mail (apps/api services/mail-settings.ts). It cannot look into DNS: «Prüfen»
 * treats the records as published, so the flow can be tried end to end. Nothing is sent from these addresses.
 */
export class MockMailSettings {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	settings(): Promise<MailSettingsView> {
		return this.#db.request(() => this.#view(this.#tenant()));
	}

	async addDomain(input: { domain: string; purpose: DomainPurpose }): Promise<MailDomainView> {
		const domain = normalizeDomain(input.domain);
		if (!domain || domain === 'clinks.ch' || domain.endsWith('.clinks.ch'))
			throw this.#invalid('domain', 'error.ws.mail_domain_invalid');
		const publicKey = await demoPublicKey();
		return this.#db.request(() => {
			const tenantId = this.#tenant();
			if (this.#domains(tenantId).some((row) => row.domain === domain))
				throw new MockApiError('conflict', this.#context.localize('error.ws.mail_domain_taken'));
			const row: MockMailDomain = {
				id: newId(),
				tenantId,
				domain,
				purpose: input.purpose,
				selector: `clinks-${publicKey
					.slice(-8, -2)
					.toLowerCase()
					.replace(/[^a-z0-9]/g, 'x')}`,
				dkimPublicKey: publicKey,
				status: 'pending',
				checks: [],
				checkedAt: null,
			};
			this.#db.table('mailDomains').push(row);
			return mailDomainView(row, demoSpfInclude);
		}, ['mailDomains']);
	}

	checkDomain(id: string): Promise<MailDomainView> {
		return this.#db.request(() => {
			const row = this.#domains(this.#tenant()).find((candidate) => candidate.id === id);
			if (!row) throw new MockApiError('not_found', this.#context.localize('error.ws.not_found'));
			const expected = expectedRecords(
				row.domain,
				{ selector: row.selector, publicKey: row.dkimPublicKey },
				demoSpfInclude,
			);
			row.checks = expected.map((record) => ({ record: record.record, ok: true, found: record.value }));
			row.status = 'verified';
			row.checkedAt = new Date().toISOString();
			return mailDomainView(row, demoSpfInclude);
		}, ['mailDomains']);
	}

	removeDomain(id: string): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#tenant();
			if (this.#senders(tenantId).some((sender) => sender.domainId === id))
				throw new MockApiError('conflict', this.#context.localize('error.ws.mail_domain_in_use'));
			this.#db.replace(
				'mailDomains',
				this.#db.table('mailDomains').filter((row) => row.id !== id),
			);
		}, ['mailDomains']);
	}

	saveSender(id: string | null, input: MailSenderInput): Promise<MailSenderView> {
		return this.#db.request(() => {
			const tenantId = this.#tenant();
			const address = input.address.trim().toLowerCase();
			const domain = this.#domains(tenantId).find((row) => row.domain === address.split('@')[1]);
			if (!domain || !senderFits(input.kind, domain.purpose))
				throw this.#invalid('address', 'error.ws.mail_sender_domain');
			const senders = this.#senders(tenantId);
			if (senders.some((sender) => sender.address === address && sender.id !== id))
				throw new MockApiError('conflict', this.#context.localize('error.ws.mail_sender_taken'));
			if (input.isDefault && input.kind !== 'personal')
				for (const sender of senders) if (sender.kind === input.kind) sender.isDefault = false;
			const row: MockMailSender = { ...input, address, id: id ?? newId(), tenantId, domainId: domain.id };
			this.#db.replace('mailSenders', [...this.#db.table('mailSenders').filter((sender) => sender.id !== row.id), row]);
			return this.#view(tenantId).senders.find((sender) => sender.id === row.id)!;
		}, ['mailSenders']);
	}

	/** A new filing address; in the demo nothing arrives there, it only shows how it looks. */
	rotateFilingAddress(): Promise<MailSettingsView> {
		return this.#db.request(() => {
			const tenantId = this.#tenant();
			const local = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) =>
				'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(byte % 36),
			).join('');
			const others = this.#db.table('mailFilingAddresses').filter((row) => row.tenantId !== tenantId);
			this.#db.replace('mailFilingAddresses', [
				...others,
				{ id: newId(), tenantId, address: `ablage-${local}@${demoInboundDomain}` },
			]);
			return this.#view(tenantId);
		}, ['mailFilingAddresses']);
	}

	removeSender(id: string): Promise<void> {
		return this.#db.request(() => {
			this.#tenant();
			this.#db.replace(
				'mailSenders',
				this.#db.table('mailSenders').filter((sender) => sender.id !== id),
			);
		}, ['mailSenders']);
	}

	#view(tenantId: string): MailSettingsView {
		const domains = this.#domains(tenantId);
		const verified = new Set(domains.filter((row) => row.status === 'verified').map((row) => row.id));
		return {
			// The demo sends nothing outside, so senders count as ready once their domain is verified.
			relay: true,
			filingAddress: this.#db.table('mailFilingAddresses').find((row) => row.tenantId === tenantId)?.address ?? null,
			domains: domains.map((row) => mailDomainView(row, demoSpfInclude)),
			senders: this.#senders(tenantId).map(({ tenantId: _tenant, ...sender }) => ({
				...sender,
				active: verified.has(sender.domainId),
			})),
		};
	}

	#domains(tenantId: string) {
		return this.#db.table('mailDomains').filter((row) => row.tenantId === tenantId);
	}

	appointmentMail(): Promise<AppointmentMailSettings> {
		return this.#db.request(() => {
			const tenant = this.#db.table('tenants').find((row) => row.id === this.#tenant())!;
			return { ...defaultAppointmentMail, ...tenant.appointmentMail };
		});
	}

	/** The demo keeps the settings; it sends no confirmations or reminders (nothing leaves the browser). */
	saveAppointmentMail(input: AppointmentMailSettings): Promise<void> {
		return this.#db.request(() => {
			const tenant = this.#db.table('tenants').find((row) => row.id === this.#tenant())!;
			tenant.appointmentMail = { ...input };
		}, ['tenants']);
	}

	#senders(tenantId: string) {
		return this.#db.table('mailSenders').filter((row) => row.tenantId === tenantId);
	}

	#tenant() {
		const tenantId = this.#context.tenantId();
		if (!tenantId) throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		if (!this.#context.can('settings.manage'))
			throw new MockApiError('forbidden', this.#context.localize('error.forbidden'));
		return tenantId;
	}

	#invalid(field: string, key: string) {
		return new MockApiError('validation', this.#context.localize('error.validation'), {
			[field]: this.#context.localize(key),
		});
	}
}

/** A real RSA public key, so the records look like the ones the API shows. */
async function demoPublicKey() {
	const pair = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify'],
	);
	const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
	let binary = '';
	for (const byte of spki) binary += String.fromCharCode(byte);
	return btoa(binary);
}
