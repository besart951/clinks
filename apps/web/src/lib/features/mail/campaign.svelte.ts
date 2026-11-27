import { toast } from 'svelte-sonner';
import type { CampaignId } from '@clinks/domain/ids';
import type { AudienceView } from '@clinks/contracts/newsletter';
import type { Campaign, CampaignStats, Contact } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { campaignChecks } from '@clinks/domain/campaigns';

type CampaignFields = Pick<Campaign, 'name' | 'subject' | 'previewText' | 'body' | 'audienceTag'>;
type WorkflowStep = 'review' | 'withdraw' | 'approve';

/**
 * One campaign: editing (synced, content only), checks, and the workflow draft → review → approved → scheduled/sent,
 * whose steps the server takes (four-eyes rule, audience at sending).
 */
export class CampaignEditorModel {
	readonly resource: Resource<{ campaign: Campaign; contacts: Contact[]; audience: AudienceView }>;
	value = $state<CampaignFields>({ name: '', subject: '', previewText: '', body: '', audienceTag: '' });
	scheduleAt = $state('');
	busy = $state(false);
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	constructor(workspace: Workspace, id: CampaignId) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['campaigns', 'contacts'], async () => {
			const [campaign, contacts, audience] = await Promise.all([
				workspace.api.campaigns.get(id),
				workspace.api.contacts.list().catch(() => []),
				workspace.campaignWorkflow.audience(id).catch(() => ({ count: 0, suppressed: 0 })),
			]);
			if (!this.dirty || this.#initial === '') this.#reset(campaign);
			return { campaign, contacts, audience };
		});
	}

	/** Tags with how many contacts carry them; the campaign reaches only those who subscribed. */
	get audiences(): { tag: string; count: number }[] {
		const contacts = this.#subscribed();
		const tags = [...new Set((this.resource.data?.contacts ?? []).flatMap((contact) => contact.tags))].sort();
		return tags.map((tag) => ({ tag, count: contacts.filter((contact) => contact.tags.includes(tag)).length }));
	}

	/** Subscribed contacts with the tag (blocked addresses are left out by the server when sending). */
	get recipients(): Contact[] {
		return this.#subscribed().filter((contact) => contact.tags.includes(this.value.audienceTag));
	}

	get checks() {
		return campaignChecks(this.value, this.recipients.length);
	}

	get editable() {
		const status = this.resource.data?.campaign.status;
		return this.#workspace.session.can('mail.write') && (status === 'draft' || status === 'review');
	}

	/** Who sent it to review sees «Wartet auf Freigabe»; the server decides whether they may approve it themselves. */
	get submittedByMe() {
		return this.resource.data?.campaign.submittedBy === this.#workspace.session.user?.id;
	}

	/** Patient or client status is health data: the editor reminds that only consenting contacts are reached. */
	get healthData() {
		return this.#workspace.session.hasModule('physio') || this.#workspace.session.hasModule('spitex');
	}

	async save() {
		const campaign = this.resource.data?.campaign;
		if (!campaign) return null;
		this.busy = true;
		const saved = await this.#workspace.run(
			() => this.#workspace.api.campaigns.update(campaign.id, campaign.revision, $state.snapshot(this.value)),
			{ success: 'ui.ws.campaign.saved' },
		);
		if (saved) this.#reset(saved);
		this.busy = false;
		return saved;
	}

	async step(step: WorkflowStep) {
		const campaign = this.resource.data?.campaign;
		if (!campaign) return;
		if (step === 'review' && this.checks.some((check) => check.level === 'error')) {
			toast.error(this.#workspace.t('ui.ws.campaign.fix_errors'));
			return;
		}
		if (this.dirty && !(await this.save())) return;
		const done = await this.#run(
			() => this.#workspace.campaignWorkflow.step(campaign.id, step),
			`ui.ws.campaign.step_${step}`,
		);
		if (done && step === 'review') {
			const people = await this.#workspace.api.people();
			await this.#workspace.api.notify(
				people.map((person) => person.id),
				'system',
				{ key: 'ui.ws.notification.campaign_review', params: { target: campaign.name } },
				`/mail/campaigns/${campaign.id}`,
			);
		}
	}

	/** «Planen» at the chosen time, or «Jetzt senden». */
	schedule(now: boolean) {
		const campaign = this.resource.data?.campaign;
		if (!campaign) return;
		const at = now ? null : new Date(this.scheduleAt).toISOString();
		return this.#run(
			() => this.#workspace.campaignWorkflow.schedule(campaign.id, at),
			now ? 'ui.ws.campaign.step_send' : 'ui.ws.campaign.step_schedule',
		);
	}

	sendTest() {
		const campaign = this.resource.data?.campaign;
		if (!campaign) return;
		return this.#run(() => this.#workspace.campaignWorkflow.step(campaign.id, 'test'), 'ui.ws.campaign.test_sent', {
			email: this.#workspace.session.user?.email ?? '',
		});
	}

	async #run(action: () => Promise<void>, success: string, successParams?: Record<string, string>) {
		this.busy = true;
		try {
			await action();
			toast.success(this.#workspace.t(success, successParams));
			return true;
		} catch (error) {
			toast.error(this.#workspace.message(error));
			return false;
		} finally {
			this.busy = false;
		}
	}

	#subscribed() {
		return (this.resource.data?.contacts ?? []).filter(
			(contact) => contact.email && !contact.archived && contact.newsletter === 'subscribed',
		);
	}

	#reset(campaign: Campaign) {
		this.value = {
			name: campaign.name,
			subject: campaign.subject,
			previewText: campaign.previewText,
			body: campaign.body,
			audienceTag: campaign.audienceTag,
		};
		this.#initial = JSON.stringify(this.value);
		const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
		inTwoDays.setHours(9, 0, 0, 0);
		this.scheduleAt = (campaign.scheduledAt ? new Date(campaign.scheduledAt) : inTwoDays).toISOString().slice(0, 16);
	}
}

/** The workflow fields of a new campaign; the server sets them from here on (sync ignores them on upload). */
const unsent = {
	status: 'draft' as const,
	scheduledAt: null,
	sentAt: null,
	approvedBy: null,
	submittedBy: null,
	stats: { recipients: 0, sent: 0, bounced: 0, unsubscribes: 0 } satisfies CampaignStats,
};

export class CampaignListModel {
	readonly resource: Resource<Campaign[]>;
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['campaigns'], async () =>
			(await workspace.api.campaigns.list()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
		);
	}

	create() {
		return this.#workspace.run(() =>
			this.#workspace.api.campaigns.create({
				name: this.#workspace.t('ui.ws.campaign.untitled'),
				subject: '',
				previewText: '',
				body: this.#workspace.t('ui.ws.campaign.default_body'),
				audienceTag: '',
				...unsent,
			}),
		);
	}

	async duplicate(campaign: Campaign) {
		return this.#workspace.run(
			() =>
				this.#workspace.api.campaigns.create({
					...campaign,
					name: this.#workspace.t('ui.ws.campaign.copy_of', { name: campaign.name }),
					...unsent,
				}),
			{ success: 'ui.ws.campaign.duplicated' },
		);
	}

	async remove(campaign: Campaign) {
		const api = this.#workspace.api.campaigns;
		await this.#workspace.run(() => api.remove(campaign.id), {
			success: 'ui.ws.campaign.deleted',
			undo: () => api.restore(campaign),
		});
	}
}
