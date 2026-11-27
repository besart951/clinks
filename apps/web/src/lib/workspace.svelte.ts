import { RemoteAccountApi } from './data/remote-account.ts';
import type { PageKeys } from './features/shell/page-keys.ts';
import { DocumentFiles } from './data/document-files.ts';
import { DocumentShares } from './data/document-shares.ts';
import { InvoiceFiles } from './data/invoice-files.ts';
import { InvoiceDelivery } from './data/invoice-delivery.ts';
import { BankImports } from './data/bank-imports.ts';
import { MailSettings } from './data/mail-settings.ts';
import { MailOutgoing } from './data/mail-outgoing.ts';
import { CampaignWorkflow, NewsletterConsents, NewsletterForms } from './data/newsletter.ts';
import { createContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { AccountApi, roleFor } from './data/account-api.ts';
import {
	MockApiError,
	MockDatabase,
	WorkspaceCache,
	emptySnapshot,
	tableNames,
	type TableName,
} from './data/database.ts';
import { NetworkSimulator } from './data/network.svelte.ts';
import { demoRowsFor, createSeed } from './data/seed.ts';
import { workspaceTable } from './data/workspace-tables.ts';
import { WorkspaceApi } from './data/workspace-api.ts';
import type { Patchable } from '@clinks/contracts/repository';
import { roleGrants } from '@clinks/domain/permissions';
import type { TenantId } from '@clinks/domain/ids';
import { Translator, type TranslationParams } from './i18n/translator.svelte.ts';
import { Session } from './session/session.svelte.ts';
import type { AuthGateway } from './session/auth-gateway.ts';
import { MockAuthGateway } from './session/mock-auth.ts';
import { RemoteAuthGateway } from './session/remote-auth.ts';
import { ApiClient } from './data/api-client.ts';
import type { RequestContext } from './data/repository.ts';
import { SyncEngine } from './sync/sync-engine.svelte.ts';
import { ThemeController } from './state/theme.svelte.ts';
import type { Platform } from './platform/types.ts';
import { createWebPlatform } from './platform/web.svelte.ts';
import { browserStorage } from './platform/web-storage.ts';

export interface RunOptions {
	success?: string;
	successParams?: TranslationParams;
	undo?: () => Promise<unknown>;
}

/** Everything a screen needs: the mock API, the signed-in session and the translator. */
export class Workspace {
	readonly platform: Platform;
	readonly network: NetworkSimulator;
	readonly i18n: Translator;
	readonly theme: ThemeController;
	readonly db: WorkspaceCache;
	readonly account: AccountApi;
	readonly documentFiles: DocumentFiles;
	readonly invoiceFiles: InvoiceFiles;
	readonly invoiceDelivery: InvoiceDelivery;
	readonly bankImports: BankImports;
	readonly mailSettings: MailSettings;
	readonly mailOutgoing: MailOutgoing;
	readonly documentShares: DocumentShares;
	readonly newsletterForms: NewsletterForms;
	readonly newsletterConsents: NewsletterConsents;
	readonly campaignWorkflow: CampaignWorkflow;
	readonly remote: ApiClient | null;
	/** Sign-in, onboarding and invitations: against the API when `VITE_API_URL` is set, otherwise the demo. */
	readonly auth: AuthGateway;
	readonly session: Session;
	readonly api: WorkspaceApi;
	/** The synced local database; null on the mock. */
	readonly sync: SyncEngine | null;
	readonly persistent: boolean;
	/** The "N" shortcut runs the create action of the page that is open. */
	newAction = $state<(() => void) | null>(null);
	/** The keys of the page in front, e.g. a list's (`features/shell/page-keys.ts`). */
	pageKeys = $state.raw<PageKeys | null>(null);
	versions = $state(Object.fromEntries(tableNames.map((name) => [name, 0])) as { [Name in TableName]: number });

	constructor(platform: Platform = createWebPlatform()) {
		this.platform = platform;
		this.network = new NetworkSimulator(platform.preferences);
		this.i18n = new Translator(platform.preferences);
		this.theme = new ThemeController(platform.preferences);
		const storage = browserStorage();
		this.persistent = storage !== null;
		const localize = (key: string) => this.i18n.t(key);
		const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
		const client = apiUrl ? new ApiClient(apiUrl, () => this.i18n.locale, localize) : null;
		const options = { storage, localize, seed: emptySnapshot };
		this.db = client
			? new WorkspaceCache(options, 'clinks.workspace.account.v1')
			: new MockDatabase({
					...options,
					seed: () => createSeed(new Date()),
					conditions: () => this.network.conditions(),
				});
		const caller = { userId: () => this.session.callerId(), tenantId: () => this.session.tenantId, localize };
		const context: RequestContext = {
			tenantId: () => this.session.tenantId,
			actorId: () => this.session.callerId(),
			can: (permission) => roleGrants(roleFor(this.db, this.session.callerId(), this.session.tenantId), permission),
			localize,
		};
		this.remote = client;
		this.documentFiles = new DocumentFiles(client, platform, localize);
		this.invoiceFiles = new InvoiceFiles(client, platform.files, () => this.api, localize);
		this.invoiceDelivery = new InvoiceDelivery(client, platform.files, () => this.api, localize);
		this.bankImports = new BankImports(client, () => this.api);
		this.mailSettings = new MailSettings(client, () => this.api);
		this.mailOutgoing = new MailOutgoing(client, () => this.api);
		this.documentShares = new DocumentShares(client, () => this.api);
		this.newsletterForms = new NewsletterForms(client, () => this.api);
		this.newsletterConsents = new NewsletterConsents(client, () => this.api);
		this.campaignWorkflow = new CampaignWorkflow(
			client,
			() => this.api,
			() => this.sync,
		);
		if (client) {
			this.sync = new SyncEngine(
				client,
				(import.meta.env.VITE_POWERSYNC_URL as string | undefined) ?? 'http://localhost:8080',
				{
					changed: (table) => this.db.touch(workspaceTable(table)),
					rejected: (message) => toast.error(message),
				},
			);
			const gateway = new RemoteAuthGateway(
				client,
				this.db,
				this.sync,
				() => new WorkspaceCache(options),
				platform.preferences,
			);
			this.auth = gateway;
			this.account = new RemoteAccountApi(this.db, caller, client, gateway);
			this.api = new WorkspaceApi(this.db, context, this.sync);
		} else {
			this.sync = null;
			this.account = new AccountApi(this.db, caller);
			this.auth = new MockAuthGateway(this.account, localize);
			this.api = new WorkspaceApi(this.db, context);
		}
		this.session = new Session(this.account, this.auth, platform.secure);
		this.db.on((table) => (this.versions[table] += 1));
		this.db.onPending((pending) => (this.network.pending = pending));
	}

	t(key: string, params?: TranslationParams) {
		return this.i18n.t(key, params);
	}

	message(error: unknown): string {
		return error instanceof MockApiError ? error.message : this.t('error.internal');
	}

	fieldErrors(error: unknown): { [field: string]: string } {
		return error instanceof MockApiError ? error.fields : {};
	}

	/** Runs a change and reports the outcome as a toast, with an undo action where one is given. */
	async run<T>(action: () => Promise<T>, options: RunOptions = {}): Promise<T | null> {
		try {
			const result = await action();
			if (options.success) {
				const undo = options.undo;
				toast.success(this.t(options.success, options.successParams), {
					action: undo
						? { label: this.t('ui.ws.undo'), onClick: () => void this.run(undo, { success: 'ui.ws.undone' }) }
						: undefined,
				});
			}
			return result;
		} catch (error) {
			toast.error(this.message(error));
			return null;
		}
	}

	/**
	 * Saves an in-place edit of one record: a quiet toast with undo, which restores the previous values on the
	 * latest revision so later edits by others are not lost.
	 */
	async patch<Record extends { id: string; revision: number }, Patch extends object>(
		api: Patchable<Record, Patch>,
		record: Record,
		patch: Patch,
		label: string,
	): Promise<Record | null> {
		const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, record[key as keyof Record]])) as Patch;
		return this.run(() => api.update(record.id, record.revision, patch), {
			success: 'ui.ws.inline.saved',
			successParams: { field: label },
			undo: async () => {
				const current = await api.get(record.id);
				return api.update(record.id, current.revision, previous);
			},
		});
	}

	/** Registers the page's create action for the "N" shortcut; returns the cleanup. */
	registerNewAction(action: () => void): () => void {
		this.newAction = action;
		return () => {
			if (this.newAction === action) this.newAction = null;
		};
	}

	/** Registers the page's keys for the app's key handler and the «?» overview; returns the cleanup. */
	registerPageKeys(keys: PageKeys): () => void {
		this.pageKeys = keys;
		return () => {
			if (this.pageKeys === keys) this.pageKeys = null;
		};
	}

	seedDemo(tenantId: TenantId) {
		return demoRowsFor(tenantId, new Date());
	}

	resetDemo() {
		this.db.reset();
		void this.session.refresh();
	}
}

export const [useWorkspace, setWorkspace] = createContext<Workspace>();
