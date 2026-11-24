import { toast } from 'svelte-sonner';
import {
	connectionDefaults,
	dataLocation,
	infomaniakRegions,
	needsLocationConsent,
	parseR2Endpoint,
	r2Endpoint,
	type R2Jurisdiction,
	type StorageConnection,
	type StorageProblem,
	type StorageProvider,
	type StorageSettingsView,
} from '@clinks/domain/storage';
import type { Workspace } from '../../workspace.svelte.ts';
import { SettingsForm } from './settings.svelte.ts';

/** Cloudflare R2 is configured by account id and jurisdiction; the endpoint follows from them. */
interface R2Fields {
	accountId: string;
	jurisdiction: R2Jurisdiction;
}

/** Where the tenant's documents are stored: CLinks storage or the tenant's own S3-compatible bucket. */
export class StorageSettingsModel extends SettingsForm {
	stored = $state.raw<StorageSettingsView | null>(null);
	loaded = $state(false);
	/** Set when the current settings could not be read; the form stays hidden so nothing is overwritten blindly. */
	loadError = $state('');
	provider = $state<StorageProvider>('clinks');
	connection = $state<StorageConnection>(connectionDefaults('clinks'));
	r2 = $state<R2Fields>({ accountId: '', jurisdiction: 'eu' });
	secret = $state('');
	acknowledgeLocation = $state(false);
	testing = $state(false);
	/** What the last connection check found wrong; shown under the actions until the next check or save. */
	problems = $state<StorageProblem[]>([]);

	readonly endpoint = $derived(
		this.provider === 'cloudflare' ? r2Endpoint(this.r2.accountId, this.r2.jurisdiction) : this.connection.endpoint,
	);
	readonly location = $derived(dataLocation(this.provider, this.endpoint));
	readonly consentNeeded = $derived(
		needsLocationConsent(this.location, this.workspace.session.tenant?.enabledModules ?? []),
	);
	/** A stored secret only fits the same provider and access key; otherwise a new one is required. */
	readonly keepsSecret = $derived(
		this.stored !== null &&
			this.stored.secretHint !== null &&
			this.stored.provider === this.provider &&
			this.stored.accessKeyId === this.connection.accessKeyId.trim(),
	);

	constructor(workspace: Workspace) {
		super(workspace);
	}

	async load() {
		try {
			this.#show(await this.workspace.account.storageSettings());
			this.loadError = '';
		} catch (error) {
			this.loadError = this.workspace.message(error);
		} finally {
			this.loaded = true;
		}
	}

	/** Switching provider fills in its defaults, or the saved values if that provider is the saved one. */
	selectProvider(provider: StorageProvider) {
		this.provider = provider;
		this.fields = {};
		if (this.stored?.provider === provider) this.#show(this.stored);
		else {
			this.connection = connectionDefaults(provider);
			this.r2 = { accountId: '', jurisdiction: 'eu' };
			this.secret = '';
			this.acknowledgeLocation = false;
		}
	}

	selectInfomaniakRegion(region: string) {
		const match = infomaniakRegions.find((entry) => entry.region === region);
		if (match) this.connection = { ...this.connection, region: match.region, endpoint: match.endpoint };
	}

	async save(): Promise<boolean> {
		const result = await this.attempt(
			async () => ({
				stored: await this.workspace.account.saveStorageSettings({
					...this.connection,
					endpoint: this.endpoint,
					provider: this.provider,
					secretAccessKey: this.secret,
					acknowledgeLocation: this.acknowledgeLocation,
				}),
			}),
			'ui.ws.storage.saved',
		);
		if (!result) return false;
		this.#show(result.stored);
		return true;
	}

	async test() {
		this.testing = true;
		try {
			const check = await this.workspace.account.testStorageConnection();
			this.problems = check.problems ?? [];
			if (this.stored) this.stored = { ...this.stored, lastCheck: { at: check.at, ok: check.ok } };
			if (check.ok) toast.success(this.workspace.t('ui.ws.storage.test_ok'));
			else toast.error(this.workspace.t('ui.ws.storage.test_failed'));
		} catch (error) {
			toast.error(this.workspace.message(error));
		} finally {
			this.testing = false;
		}
	}

	#show(stored: StorageSettingsView | null) {
		this.stored = stored;
		this.problems = [];
		this.provider = stored?.provider ?? 'clinks';
		this.connection = stored
			? {
					endpoint: stored.endpoint,
					region: stored.region,
					bucket: stored.bucket,
					accessKeyId: stored.accessKeyId,
					pathStyle: stored.pathStyle,
				}
			: connectionDefaults('clinks');
		const r2 = stored?.provider === 'cloudflare' ? parseR2Endpoint(stored.endpoint) : null;
		this.r2 = r2 ?? { accountId: '', jurisdiction: 'eu' };
		this.secret = '';
		this.acknowledgeLocation = stored?.locationAcknowledgedAt != null;
	}
}
