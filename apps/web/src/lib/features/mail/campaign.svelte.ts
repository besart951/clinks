import { toast } from 'svelte-sonner';
import type { CampaignId } from '@clinks/domain/ids';
import type { Campaign, CampaignStatus, Contact } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { campaignChecks } from './templates.ts';

type CampaignFields = Pick<Campaign, 'name' | 'subject' | 'previewText' | 'body' | 'audienceTag'>;

/** One campaign: editing, checks and the draft → review → approved → scheduled/sent workflow. */
export class CampaignEditorModel {
	readonly resource: Resource<{ campaign: Campaign; contacts: Contact[] }>;
	value = $state<CampaignFields>({ name: '', subject: '', previewText: '', body: '', audienceTag: '' });
	scheduleAt = $state('');
	busy = $state(false);
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	constructor(workspace: Workspace, id: CampaignId) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['campaigns'], async () => {
			const [campaign, contacts] = await Promise.all([
				workspace.api.campaigns.get(id),
				workspace.api.contacts.list().catch(() => []),
			]);
			if (!this.dirty || this.#initial === '') this.#reset(campaign);
			return { campaign, contacts };
		});
	}

	get audiences(): { tag: string; count: number }[] {
		const contacts = (this.resource.data?.contacts ?? []).filter((contact) => contact.email && !contact.archived);
		const tags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort();
		return tags.map((tag) => ({ tag, count: contacts.filter((contact) => contact.tags.includes(tag)).length }));
	}

	get recipients(): Contact[] {
		return (this.resource.data?.contacts ?? []).filter(
			(contact) => contact.email && !contact.archived && contact.tags.includes(this.value.audienceTag),
		);
	}

	get checks() {
		return campaignChecks(this.value, this.recipients.length);
	}

	get editable() {
		const status = this.resource.data?.campaign.status;
		return this.#workspace.session.can('mail.write') && (status === 'draft' || status === 'review');
	}

	/** Four-eyes rule: only people who manage settings approve campaigns for sending. */
	get canApprove() {
		const campaign = this.resource.data?.campaign;
		const session = this.#workspace.session;
		return campaign?.status === 'review' && session.can('mail.write') && session.can('settings.manage');
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

	async transition(status: CampaignStatus) {
		let campaign = this.resource.data?.campaign;
		if (!campaign) return;
		if (status !== 'draft' && this.checks.some((check) => check.level === 'error')) {
			toast.error(this.#workspace.t('ui.ws.campaign.fix_errors'));
			return;
		}
		if (this.dirty) campaign = (await this.save()) ?? campaign;
		const session = this.#workspace.session;
		const patch: Partial<Campaign> = { status };
		if (status === 'approved') patch.approvedBy = session.user?.id ?? null;
		if (status === 'scheduled') patch.scheduledAt = new Date(this.scheduleAt).toISOString();
		if (status === 'sent') {
			const recipients = this.recipients.length;
			patch.sentAt = new Date().toISOString();
			patch.stats = { recipients, opens: 0, clicks: 0, unsubscribes: 0 };
		}
		const current = campaign;
		const saved = await this.#workspace.run(
			() => this.#workspace.api.campaigns.update(current.id, current.revision, patch),
			{
				success: `ui.ws.campaign.transition_${status}`,
			},
		);
		if (saved && status === 'review') {
			const people = await this.#workspace.api.people();
			await this.#workspace.api.notify(
				people.map((person) => person.id),
				'system',
				{ key: 'ui.ws.notification.campaign_review', params: { target: saved.name } },
				`/mail/campaigns/${saved.id}`,
			);
		}
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
				status: 'draft',
				scheduledAt: null,
				sentAt: null,
				approvedBy: null,
				stats: { recipients: 0, opens: 0, clicks: 0, unsubscribes: 0 },
			}),
		);
	}

	async duplicate(campaign: Campaign) {
		return this.#workspace.run(
			() =>
				this.#workspace.api.campaigns.create({
					...campaign,
					name: this.#workspace.t('ui.ws.campaign.copy_of', { name: campaign.name }),
					status: 'draft',
					scheduledAt: null,
					sentAt: null,
					approvedBy: null,
					stats: { recipients: 0, opens: 0, clicks: 0, unsubscribes: 0 },
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
