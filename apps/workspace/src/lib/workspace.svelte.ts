import { createContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { AccountApi, roleFor } from './data/account-api.ts';
import { MockApiError, MockDatabase, tableNames, type StorageLike, type TableName } from './data/database.ts';
import { NetworkSimulator } from './data/network.svelte.ts';
import { demoRowsFor, createSeed } from './data/seed.ts';
import { WorkspaceApi } from './data/workspace-api.ts';
import { roleGrants } from './domain/permissions.ts';
import type { TenantId } from './domain/ids.ts';
import { Translator, type TranslationParams } from './i18n/translator.svelte.ts';
import { Session } from './session/session.svelte.ts';
import { ThemeController } from './state/theme.svelte.ts';

function browserStorage(): StorageLike | null {
	try {
		localStorage.setItem('clinks.workspace.probe', '1');
		localStorage.removeItem('clinks.workspace.probe');
		return localStorage;
	} catch {
		return null;
	}
}

export interface RunOptions {
	success?: string;
	successParams?: TranslationParams;
	undo?: () => Promise<unknown>;
}

/** Everything a screen needs: the mock API, the signed-in session and the translator. */
export class Workspace {
	readonly network = new NetworkSimulator();
	readonly i18n = new Translator();
	readonly theme = new ThemeController();
	readonly db: MockDatabase;
	readonly account: AccountApi;
	readonly session: Session;
	readonly api: WorkspaceApi;
	readonly persistent: boolean;
	/** The "N" shortcut runs the create action of the page that is open. */
	newAction = $state<(() => void) | null>(null);
	versions = $state(Object.fromEntries(tableNames.map((name) => [name, 0])) as { [Name in TableName]: number });

	constructor() {
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
		this.session = new Session(this.account);
		this.api = new WorkspaceApi(this.db, {
			tenantId: () => this.session.tenantId,
			actorId: () => this.session.callerId(),
			can: (permission) => roleGrants(roleFor(this.db, this.session.callerId(), this.session.tenantId), permission),
			localize,
		});
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
