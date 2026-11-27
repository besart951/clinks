import type {
	AudienceView,
	ConfirmedView,
	ConsentImportResult,
	ConsentInput,
	ConsentView,
	NewsletterFormInput,
	NewsletterFormView,
	PublicFormView,
	SignUpInput,
	UnsubscribeView,
} from '@clinks/contracts/newsletter';
import { campaignChecks, mayApprove } from '@clinks/domain/campaigns';
import { newId, type CampaignId, type ContactId, type UserId } from '@clinks/domain/ids';
import { roleGrants } from '@clinks/domain/permissions';
import type { Campaign, CampaignStatus, Contact } from '@clinks/domain/types';
import { stamp, type MockNewsletterConsent, type WorkspaceCache } from './database.ts';
import { allowedCaller, appendAudit, mockError, type RequestContext } from './repository.ts';

type ConsentEntry = Pick<MockNewsletterConsent, 'status' | 'source'> &
	Partial<Pick<MockNewsletterConsent, 'consentText' | 'note' | 'actorName' | 'campaignId'>>;

/** The demo's `recordConsent` (apps/api services/newsletter-consents.ts): logs the entry, the status follows. */
function recordConsent(db: WorkspaceCache, contact: Contact, entry: ConsentEntry) {
	contact.newsletter = entry.status;
	contact.revision += 1;
	contact.updatedAt = new Date().toISOString();
	db.table('newsletterConsents').push({
		id: newId(),
		tenantId: contact.tenantId,
		contactId: contact.id,
		consentText: '',
		note: '',
		actorName: null,
		campaignId: null,
		createdAt: new Date().toISOString(),
		...entry,
	});
}

/** Contacts with the tag who subscribed and have an address: who a campaign reaches (the demo blocks nobody). */
function subscribedWithTag(db: WorkspaceCache, tenantId: string, tag: string) {
	return db
		.table('contacts')
		.filter(
			(row) =>
				row.tenantId === tenantId &&
				!row.archived &&
				row.email &&
				row.newsletter === 'subscribed' &&
				!!tag &&
				row.tags.includes(tag),
		);
}

/** Sign-up forms in Settings › E-Mail and their public side, with double opt-in (apps/api newsletter-signup.ts). */
export class MockNewsletterForms {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;
	/** The demo has no mailbox: the confirmation link of the last sign-up is shown on the page instead. */
	lastConfirmToken: string | null = null;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	list(): Promise<NewsletterFormView[]> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'settings.manage');
			return this.#db
				.table('newsletterForms')
				.filter((row) => row.tenantId === tenantId)
				.map(({ tenantId: _tenant, ...form }) => form);
		});
	}

	save(id: string | null, input: NewsletterFormInput): Promise<NewsletterFormView> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'settings.manage');
			const forms = this.#db.table('newsletterForms');
			let form = forms.find((row) => row.id === id && row.tenantId === tenantId);
			if (id && !form) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
			if (form) Object.assign(form, input);
			else {
				form = { ...input, id: newId(), tenantId, token: `${tenantId.slice(-8)}-${randomPart(12)}` };
				forms.push(form);
			}
			const { tenantId: _tenant, ...view } = form;
			return view;
		}, ['newsletterForms']);
	}

	remove(id: string): Promise<void> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'settings.manage');
			const forms = this.#db.table('newsletterForms');
			const index = forms.findIndex((row) => row.id === id && row.tenantId === tenantId);
			if (index < 0) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
			forms.splice(index, 1);
		}, ['newsletterForms']);
	}

	form(token: string): Promise<PublicFormView> {
		return this.#db.request(() => {
			const form = this.#form(token);
			const tenant = this.#db.table('tenants').find((row) => row.id === form.tenantId)!;
			return { tenantName: tenant.name, title: form.title, intro: form.intro, consentText: form.consentText };
		});
	}

	signUp(token: string, input: SignUpInput): Promise<void> {
		return this.#db.request(() => {
			if (input.website) return;
			const form = this.#form(token);
			this.lastConfirmToken = randomPart(32);
			this.#db.table('newsletterRequests').push({
				id: newId(),
				tenantId: form.tenantId,
				formId: form.id,
				firstName: input.firstName,
				lastName: input.lastName,
				email: input.email.toLowerCase(),
				token: this.lastConfirmToken,
				createdAt: new Date().toISOString(),
			});
		}, ['newsletterRequests']);
	}

	confirm(token: string): Promise<ConfirmedView> {
		return this.#db.request(() => {
			const requests = this.#db.table('newsletterRequests');
			const index = requests.findIndex((row) => row.token === token);
			const request = requests[index];
			const form = request && this.#db.table('newsletterForms').find((row) => row.id === request.formId);
			if (!request || !form) throw mockError(this.#context, 'not_found', 'error.ws.newsletter_link_invalid');
			requests.splice(index, 1);
			const contacts = this.#db.table('contacts');
			let contact = contacts.find(
				(row) => row.tenantId === request.tenantId && row.email.toLowerCase() === request.email,
			);
			if (contact) contact.tags = [...new Set([...contact.tags, ...form.tags])];
			else {
				contact = stamp<Contact>({
					id: newId<ContactId>(),
					tenantId: request.tenantId,
					kind: 'person',
					firstName: request.firstName,
					lastName: request.lastName,
					companyName: '',
					email: request.email,
					phone: '',
					address: { street: '', houseNumber: '', zip: '', city: '' },
					birthDate: null,
					insurer: '',
					tags: [...form.tags],
					notes: '',
					archived: false,
				});
				contacts.push(contact);
			}
			recordConsent(this.#db, contact, { status: 'subscribed', source: 'form', consentText: form.consentText });
			return { tenantName: this.#db.table('tenants').find((row) => row.id === request.tenantId)!.name };
		}, ['newsletterRequests', 'contacts', 'newsletterConsents']);
	}

	#form(token: string) {
		const form = this.#db.table('newsletterForms').find((row) => row.token === token && row.active);
		if (!form) throw mockError(this.#context, 'not_found', 'error.ws.newsletter_form_unknown');
		return form;
	}
}

/** Consent on the contact page and by import, and the unsubscribe page (apps/api newsletter-consents.ts). */
export class MockNewsletterConsents {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	history(contactId: string): Promise<ConsentView[]> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'contacts.read');
			return this.#db
				.table('newsletterConsents')
				.filter((row) => row.tenantId === tenantId && row.contactId === contactId)
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
				.map(({ tenantId: _tenant, contactId: _contact, campaignId: _campaign, ...entry }) => entry);
		});
	}

	record(contactId: string, input: ConsentInput): Promise<void> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			const contact = this.#db.table('contacts').find((row) => row.id === contactId && row.tenantId === tenantId);
			if (!contact) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
			recordConsent(this.#db, contact, { ...input, source: 'manual', actorName: this.#actorName(actorId) });
		}, ['contacts', 'newsletterConsents']);
	}

	import(input: { emails: string[]; note: string }): Promise<ConsentImportResult> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			const wanted = [...new Set(input.emails.map((email) => email.toLowerCase()))];
			const contacts = this.#db
				.table('contacts')
				.filter((row) => row.tenantId === tenantId && wanted.includes(row.email.toLowerCase()));
			for (const contact of contacts)
				if (contact.newsletter !== 'subscribed')
					recordConsent(this.#db, contact, {
						status: 'subscribed',
						source: 'import',
						note: input.note,
						actorName: this.#actorName(actorId),
					});
			const known = new Set(contacts.map((contact) => contact.email.toLowerCase()));
			return { subscribed: contacts.length, unknown: wanted.filter((email) => !known.has(email)) };
		}, ['contacts', 'newsletterConsents']);
	}

	unsubscribeView(token: string): Promise<UnsubscribeView> {
		return this.#db.request(() => {
			const { contact } = this.#target(token);
			const tenant = this.#db.table('tenants').find((row) => row.id === contact.tenantId)!;
			return { tenantName: tenant.name, done: contact.newsletter === 'unsubscribed' };
		});
	}

	unsubscribe(token: string): Promise<void> {
		return this.#db.request(() => {
			const { contact, campaignId } = this.#target(token);
			if (contact.newsletter === 'unsubscribed') return;
			recordConsent(this.#db, contact, { status: 'unsubscribed', source: 'unsubscribe_link', campaignId });
			const campaign = this.#db.table('campaigns').find((row) => row.id === campaignId);
			if (campaign) campaign.stats = { ...campaign.stats, unsubscribes: campaign.stats.unsubscribes + 1 };
		}, ['contacts', 'newsletterConsents', 'campaigns']);
	}

	/** The demo keeps no reason; the API logs it. */
	unsubscribeReason(token: string): Promise<void> {
		return this.#db.request(() => void this.#target(token));
	}

	/** The demo's links carry the contact and campaign as they are; the API's are signed. */
	#target(token: string) {
		const [contactId, campaignId] = token.split('.');
		const contact = this.#db.table('contacts').find((row) => row.id === contactId);
		if (!contact) throw mockError(this.#context, 'not_found', 'error.ws.newsletter_link_invalid');
		return { contact, campaignId: campaignId && campaignId !== 'x' ? campaignId : null };
	}

	#actorName(actorId: string) {
		const user = this.#db.table('users').find((row) => row.id === actorId);
		return user ? `${user.firstName} ${user.lastName}`.trim() : null;
	}
}

/** The demo's unsubscribe link for one recipient of a campaign, to try the page. */
export function demoUnsubscribeToken(contactId: string, campaignId: string | null) {
	return `${contactId}.${campaignId ?? 'x'}`;
}

/** The campaign workflow (apps/api services/campaigns.ts); the demo «sends» at once when a campaign is due. */
export class MockCampaignWorkflow {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	audience(id: CampaignId): Promise<AudienceView> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'mail.read');
			const campaign = this.#campaign(id, tenantId);
			return { count: subscribedWithTag(this.#db, tenantId, campaign.audienceTag).length, suppressed: 0 };
		});
	}

	review(id: CampaignId) {
		return this.#step(id, ['draft'], 'review', (campaign, tenantId, actorId) => {
			const reached = subscribedWithTag(this.#db, tenantId, campaign.audienceTag).length;
			if (campaignChecks(campaign, reached).some((check) => check.level === 'error'))
				throw mockError(this.#context, 'validation', 'error.ws.campaign_not_ready');
			return { submittedBy: actorId };
		});
	}

	withdraw(id: CampaignId) {
		return this.#step(id, ['review', 'approved', 'scheduled'], 'draft', () => ({
			approvedBy: null,
			scheduledAt: null,
			submittedBy: null,
		}));
	}

	approve(id: CampaignId) {
		return this.#step(id, ['review'], 'approved', (campaign, tenantId, actorId) => {
			if (!mayApprove(campaign, actorId, this.#writers(tenantId)))
				throw mockError(this.#context, 'forbidden', 'error.ws.campaign_second_person');
			return { approvedBy: actorId };
		});
	}

	schedule(id: CampaignId, at: string | null) {
		return this.#step(id, ['approved'], 'scheduled', (campaign, tenantId) => {
			if (at && new Date(at).getTime() < Date.now() - 60_000)
				throw mockError(this.#context, 'validation', 'error.ws.campaign_in_past');
			if (at) return { scheduledAt: at };
			// «Jetzt senden»: nothing leaves the browser; the numbers are what the server would count.
			const recipients = subscribedWithTag(this.#db, tenantId, campaign.audienceTag).length;
			const now = new Date().toISOString();
			return {
				status: 'sent' as const,
				scheduledAt: now,
				sentAt: now,
				stats: { recipients, sent: recipients, bounced: 0, unsubscribes: 0 },
			};
		});
	}

	/** The demo has no outbox: the test copy is not sent anywhere. */
	test(id: CampaignId): Promise<void> {
		return this.#db.request(() => {
			const { tenantId } = allowedCaller(this.#context, 'mail.write');
			this.#campaign(id, tenantId);
		});
	}

	#step(
		id: CampaignId,
		from: CampaignStatus[],
		to: CampaignStatus,
		change: (campaign: Campaign, tenantId: string, actorId: UserId) => Partial<Campaign>,
	): Promise<void> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			const campaign = this.#campaign(id, tenantId);
			if (!from.includes(campaign.status)) throw mockError(this.#context, 'conflict', 'error.ws.campaign_wrong_step');
			Object.assign(campaign, { status: to }, change(campaign, tenantId, actorId), {
				revision: campaign.revision + 1,
				updatedAt: new Date().toISOString(),
			});
			appendAudit(this.#db, {
				tenantId: campaign.tenantId,
				actorId,
				action: 'campaign.updated',
				target: { kind: 'campaign', id: campaign.id, label: campaign.name },
			});
		}, ['campaigns', 'audit']);
	}

	#campaign(id: CampaignId, tenantId: string) {
		const campaign = this.#db.table('campaigns').find((row) => row.id === id && row.tenantId === tenantId);
		if (!campaign) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
		return campaign;
	}

	/** Active members whose role may write mail. */
	#writers(tenantId: string) {
		return this.#db
			.table('memberships')
			.filter((row) => row.tenantId === tenantId && row.status === 'active')
			.filter((row) => roleGrants(this.#db.table('roles').find((role) => role.id === row.roleId) ?? null, 'mail.write'))
			.length;
	}
}

function randomPart(length: number) {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
