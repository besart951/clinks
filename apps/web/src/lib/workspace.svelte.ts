import { createContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { AccountApi, roleFor } from './data/account-api.ts';
import { MockApiError, MockDatabase, tableNames, type TableName } from './data/database.ts';
import { NetworkSimulator } from './data/network.svelte.ts';
import { demoRowsFor, createSeed } from './data/seed.ts';
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
import { SyncedRepository } from './sync/synced-repository.ts';
import { appointmentSchema, contactSchema } from '@clinks/contracts/schemas';
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
	readonly db: MockDatabase;
	readonly account: AccountApi;
	/** Sign-in, onboarding and invitations: against the API when `VITE_API_URL` is set, otherwise the demo. */
	readonly auth: AuthGateway;
	readonly session: Session;
	readonly api: WorkspaceApi;
	/** The synced local database; null on the mock. */
	readonly sync: SyncEngine | null;
	readonly persistent: boolean;
	/** The "N" shortcut runs the create action of the page that is open. */
	newAction = $state<(() => void) | null>(null);
	versions = $state(Object.fromEntries(tableNames.map((name) => [name, 0])) as { [Name in TableName]: number });

	constructor(platform: Platform = createWebPlatform()) {
		this.platform = platform;
		this.network = new NetworkSimulator(platform.preferences);
		this.i18n = new Translator(platform.preferences);
		this.theme = new ThemeController(platform.preferences);
		// The mock database is browser-only and goes away with PowerSync in phase 4.
		const storage = browserStorage();
		this.persistent = storage !== null;
		const localize = (key: string) => this.i18n.t(key);
		this.db = new MockDatabase({
			storage,
			seed: () => createSeed(new Date()),
			conditions: () => this.network.conditions(),
			localize,
		});
		this.account = new AccountApi(this.db, {
			userId: () => this.session.callerId(),
			tenantId: () => this.session.tenantId,
			localize,
		});
		const context: RequestContext = {
			tenantId: () => this.session.tenantId,
			actorId: () => this.session.callerId(),
			can: (permission) => roleGrants(roleFor(this.db, this.session.callerId(), this.session.tenantId), permission),
			localize,
		};
		const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
		if (apiUrl) {
			const client = new ApiClient(apiUrl, () => this.i18n.locale, localize);
			this.sync = new SyncEngine(
				client,
				(import.meta.env.VITE_POWERSYNC_URL as string | undefined) ?? 'http://localhost:8080',
				{
					changed: (table) => this.db.touch(table),
					rejected: (message) => toast.error(message),
				},
			);
			this.auth = new RemoteAuthGateway(client, this.db, this.sync);
			this.api = new WorkspaceApi(this.db, context, {
				contacts: new SyncedRepository(this.sync, context, {
					table: 'contacts',
					read: 'contacts.read',
					write: 'contacts.write',
					schema: contactSchema,
				}),
				appointments: new SyncedRepository(this.sync, context, {
					table: 'appointments',
					read: 'calendar.read',
					write: 'calendar.write',
					schema: appointmentSchema,
				}),
			});
		} else {
			this.sync = null;
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

	seedDemo(tenantId: TenantId) {
		return demoRowsFor(tenantId, new Date());
	}

	resetDemo() {
		this.db.reset();
		void this.session.refresh();
	}
}

export const [useWorkspace, setWorkspace] = createContext<Workspace>();
