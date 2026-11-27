import type { DocumentShareView } from '@clinks/contracts/documents';
import type { StoredDocument } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

/** The «Teilen-Link» dialog: the file's shares, a new one for a day, a week or a month, and ending one early. */
export class ShareModel {
	shares = $state.raw<DocumentShareView[]>([]);
	/** The link just made; shown once, as the server keeps only a hash of it. */
	link = $state<string | null>(null);
	days = $state<1 | 7 | 30>(7);
	busy = $state(false);
	readonly #workspace: Workspace;
	readonly document: StoredDocument;

	constructor(workspace: Workspace, document: StoredDocument) {
		this.#workspace = workspace;
		this.document = document;
	}

	/** The shares still working, newest first; ended and expired ones are history. */
	get active(): DocumentShareView[] {
		const now = Date.now();
		return this.shares.filter((share) => !share.revokedAt && Date.parse(share.expiresAt) > now);
	}

	async load() {
		this.shares = (await this.#workspace.run(() => this.#workspace.documentShares.list(this.document.id))) ?? [];
	}

	async create() {
		this.busy = true;
		const made = await this.#workspace.run(() => this.#workspace.documentShares.create(this.document.id, this.days));
		this.busy = false;
		if (!made) return;
		this.link = made.url;
		await this.load();
	}

	async copy() {
		if (!this.link) return;
		await this.#workspace.run(() => this.#workspace.platform.files.copyText(this.link!), {
			success: 'ui.ws.documents.share_copied',
		});
	}

	async revoke(share: DocumentShareView) {
		await this.#workspace.run(() => this.#workspace.documentShares.revoke(share.id), {
			success: 'ui.ws.documents.share_revoked',
		});
		await this.load();
	}
}
