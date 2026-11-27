import {
	mailDomainView,
	type MailDomainView,
	type MailSenderInput,
	type MailSenderView,
	type MailSettingsView,
	type StoredMailDomain,
} from '@clinks/contracts/mail';
import type { Tx } from '@clinks/db/scope';
import { normalizeDomain, senderFits, type DomainPurpose } from '@clinks/domain/mail-domains';
import { randomLocalPart, uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { dkimKey, keyContext, spfInclude, verifyDomain } from './mail-domains.ts';
import { withPermission, type MemberScope } from './permissions.ts';

/** Settings › E-Mail: the workspace's sender domains (with their DNS records) and its sender addresses. */
export class MailSettingsService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	settings(claims: AccessClaims): Promise<MailSettingsView> {
		return this.#manage(claims, (tx) => this.#view(tx));
	}

	addDomain(claims: AccessClaims, input: { domain: string; purpose: DomainPurpose }, caller: Caller) {
		const domain = normalizeDomain(input.domain);
		if (!domain || domain === 'clinks.ch' || domain.endsWith('.clinks.ch'))
			throw new ApiError(400, 'error.validation', { domain: 'error.ws.mail_domain_invalid' });
		return this.#manage(claims, async (tx, scope) => {
			const taken = await tx.selectFrom('mailDomains').select('id').where('domain', '=', domain).executeTakeFirst();
			if (taken) throw new ApiError(409, 'error.ws.mail_domain_taken');
			const id = uuid();
			const key = dkimKey();
			await tx
				.insertInto('mailDomains')
				.values({
					id,
					tenantId: scope.tenantId,
					domain,
					purpose: input.purpose,
					selector: key.selector,
					dkimPublicKey: key.publicKey,
				})
				.execute();
			await tx
				.insertInto('auth.mailDomainKeys')
				.values({
					domainId: id,
					tenantId: scope.tenantId,
					privateKeyCiphertext: await this.#services.secrets.seal(key.privateKey, keyContext(id)),
				})
				.execute();
			await this.#audit(tx, scope, caller, 'mail_domain.created', id, { domain });
			return this.#domainView(tx, id);
		});
	}

	checkDomain(claims: AccessClaims, id: string) {
		return this.#manage(claims, async (tx) => {
			const domain = await tx.selectFrom('mailDomains').selectAll().where('id', '=', id).executeTakeFirst();
			if (!domain) throw new ApiError(404, 'error.ws.not_found');
			await verifyDomain(tx, this.#services, domain);
			return this.#domainView(tx, id);
		});
	}

	removeDomain(claims: AccessClaims, id: string, caller: Caller) {
		return this.#manage(claims, async (tx, scope) => {
			const used = await tx.selectFrom('mailSenders').select('id').where('domainId', '=', id).executeTakeFirst();
			if (used) throw new ApiError(409, 'error.ws.mail_domain_in_use');
			const removed = await tx.deleteFrom('mailDomains').where('id', '=', id).executeTakeFirst();
			if (removed.numDeletedRows === 0n) throw new ApiError(404, 'error.ws.not_found');
			await this.#audit(tx, scope, caller, 'mail_domain.deleted', id);
		});
	}

	saveSender(claims: AccessClaims, id: string | null, input: MailSenderInput, caller: Caller) {
		return this.#manage(claims, async (tx, scope) => {
			const domainId = await this.#domainFor(tx, input);
			const values = { ...input, address: input.address.toLowerCase(), domainId };
			if (input.isDefault && input.kind !== 'personal')
				await tx.updateTable('mailSenders').set({ isDefault: false }).where('kind', '=', input.kind).execute();
			if (id) {
				const updated = await tx.updateTable('mailSenders').set(values).where('id', '=', id).executeTakeFirst();
				if (updated.numUpdatedRows === 0n) throw new ApiError(404, 'error.ws.not_found');
			} else {
				id = uuid();
				await tx
					.insertInto('mailSenders')
					.values({ id, tenantId: scope.tenantId, ...values })
					.execute()
					.catch((error: { code?: string }) => {
						if (error.code === '23505') throw new ApiError(409, 'error.ws.mail_sender_taken');
						throw error;
					});
			}
			await this.#audit(tx, scope, caller, 'mail_sender.saved', id, { address: values.address });
			return (await this.#view(tx)).senders.find((sender) => sender.id === id)!;
		});
	}

	/** A new filing address; the old one stops filing at once (e.g. after it leaked into spam lists). */
	rotateFilingAddress(claims: AccessClaims, caller: Caller) {
		return this.#manage(claims, async (tx, scope) => {
			if (!this.#services.config.INBOUND_DOMAIN) throw new ApiError(409, 'error.ws.mail_inbound_off');
			await tx
				.updateTable('auth.mailInboundAddresses')
				.set({ active: false })
				.where('tenantId', '=', scope.tenantId)
				.execute();
			await tx
				.insertInto('auth.mailInboundAddresses')
				.values({ localPart: `ablage-${randomLocalPart(10)}`, tenantId: scope.tenantId, createdBy: scope.userId })
				.execute();
			await this.#audit(tx, scope, caller, 'mail_filing.rotated', scope.tenantId);
			return this.#view(tx);
		});
	}

	removeSender(claims: AccessClaims, id: string, caller: Caller) {
		return this.#manage(claims, async (tx, scope) => {
			const removed = await tx.deleteFrom('mailSenders').where('id', '=', id).executeTakeFirst();
			if (removed.numDeletedRows === 0n) throw new ApiError(404, 'error.ws.not_found');
			await this.#audit(tx, scope, caller, 'mail_sender.deleted', id);
		});
	}

	/** The domain an address belongs to: one of the workspace's, of the purpose the sender kind needs. */
	async #domainFor(tx: Tx, input: MailSenderInput) {
		const domain = input.address.split('@')[1].toLowerCase();
		const row = await tx
			.selectFrom('mailDomains')
			.select(['id', 'purpose'])
			.where('domain', '=', domain)
			.executeTakeFirst();
		if (!row || !senderFits(input.kind, row.purpose))
			throw new ApiError(400, 'error.validation', { address: 'error.ws.mail_sender_domain' });
		if (input.userId) {
			const member = await tx
				.selectFrom('memberships')
				.select('id')
				.where('userId', '=', input.userId)
				.where('status', '=', 'active')
				.executeTakeFirst();
			if (!member) throw new ApiError(400, 'error.validation', { userId: 'error.ws.not_found' });
		}
		return row.id;
	}

	async #view(tx: Tx): Promise<MailSettingsView> {
		const domains = await tx.selectFrom('mailDomains').selectAll().orderBy('createdAt').execute();
		const senders = await tx.selectFrom('mailSenders').selectAll().orderBy('kind').orderBy('address').execute();
		const verified = new Set(domains.filter((domain) => domain.status === 'verified').map((domain) => domain.id));
		const relay = !!this.#services.relay;
		const domain = this.#services.config.INBOUND_DOMAIN;
		const filing = domain
			? await tx
					.selectFrom('auth.mailInboundAddresses')
					.select('localPart')
					.where('active', '=', true)
					.executeTakeFirst()
			: undefined;
		return {
			relay,
			filingAddress: filing ? `${filing.localPart}@${domain}` : null,
			domains: domains.map((domain) => this.#toView(domain)),
			senders: senders.map((sender): MailSenderView => ({
				id: sender.id,
				domainId: sender.domainId,
				kind: sender.kind,
				address: sender.address,
				displayName: sender.displayName,
				replyTo: sender.replyTo,
				userId: sender.userId,
				signature: sender.signature,
				isDefault: sender.isDefault,
				active: relay && verified.has(sender.domainId),
			})),
		};
	}

	async #domainView(tx: Tx, id: string) {
		return this.#toView(await tx.selectFrom('mailDomains').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
	}

	#toView(domain: StoredMailDomain): MailDomainView {
		return mailDomainView(domain, spfInclude(this.#services));
	}

	#audit(tx: Tx, scope: MemberScope, caller: Caller, action: string, target: string, meta?: Record<string, unknown>) {
		return audit(tx, { action, actorId: scope.userId, tenantId: scope.tenantId, target, meta }, caller);
	}

	#manage<T>(claims: AccessClaims, work: (tx: Tx, scope: MemberScope) => Promise<T>) {
		return withPermission(this.#services.db, claims, 'settings.manage', work);
	}
}
