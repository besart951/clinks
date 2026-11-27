import type { FolderId } from '@clinks/domain/ids';
import type { Workspace } from '../../workspace.svelte.ts';
import { uploadDocument } from '../collaboration/attachments.svelte.ts';
import { picturesToPdf, type PdfPage } from './scan.ts';

export interface ScanSettings {
	rotate: 0 | 90 | 180 | 270;
	crop: boolean;
	enhance: boolean;
}

export interface ScannedPage {
	id: string;
	file: File;
	settings: ScanSettings;
	/** The page as it will be saved, rendered from the photo and its settings. */
	rendered: (PdfPage & { preview: string }) | null;
}

/** Turns a photo into a page; in the browser by `renderPage` (canvas), injected so the session stays testable. */
export type PageRenderer = (file: File, settings: ScanSettings) => Promise<PdfPage & { preview: string }>;

/**
 * A scan with the phone's camera: several photos, each cut to the sheet and cleaned up, saved as one PDF into
 * the folder that is open.
 */
export class ScanSession {
	pages = $state<ScannedPage[]>([]);
	name = $state('');
	busy = $state(false);
	readonly #workspace: Workspace;
	readonly #render: PageRenderer;

	constructor(workspace: Workspace, render: PageRenderer) {
		this.#workspace = workspace;
		this.#render = render;
		const now = new Date();
		this.name = workspace.t('ui.ws.documents.scan_name', {
			date: workspace.i18n.date(now.toISOString()),
			time: workspace.i18n.time(now.toISOString()),
		});
	}

	async add(files: FileList | File[]) {
		for (const file of files) {
			const page: ScannedPage = {
				id: crypto.randomUUID(),
				file,
				settings: { rotate: 0, crop: true, enhance: true },
				rendered: null,
			};
			this.pages = [...this.pages, page];
			await this.#rerender(page.id);
		}
	}

	async change(id: string, change: Partial<ScanSettings>) {
		this.pages = this.pages.map((page) =>
			page.id === id ? { ...page, settings: { ...page.settings, ...change } } : page,
		);
		await this.#rerender(id);
	}

	rotate(id: string) {
		const page = this.pages.find((candidate) => candidate.id === id);
		if (page) void this.change(id, { rotate: ((page.settings.rotate + 90) % 360) as ScanSettings['rotate'] });
	}

	remove(id: string) {
		const page = this.pages.find((candidate) => candidate.id === id);
		if (page?.rendered) URL.revokeObjectURL(page.rendered.preview);
		this.pages = this.pages.filter((candidate) => candidate.id !== id);
	}

	/** One step earlier (`-1`) or later (`1`) in the PDF. */
	move(id: string, step: -1 | 1) {
		const index = this.pages.findIndex((page) => page.id === id);
		const target = index + step;
		if (index < 0 || target < 0 || target >= this.pages.length) return;
		const pages = [...this.pages];
		[pages[index], pages[target]] = [pages[target], pages[index]];
		this.pages = pages;
	}

	get ready(): boolean {
		return this.pages.length > 0 && this.pages.every((page) => page.rendered) && !!this.name.trim();
	}

	/** Saves the pages as one PDF; returns whether it was stored. */
	async save(folderId: FolderId | null): Promise<boolean> {
		if (!this.ready) return false;
		this.busy = true;
		const pdf = picturesToPdf(this.pages.map((page) => page.rendered!));
		const name = this.name.trim().replace(/\.pdf$/i, '') + '.pdf';
		const stored = await this.#workspace.run(
			() => uploadDocument(this.#workspace, new File([pdf], name, { type: 'application/pdf' }), { folderId }),
			{ success: 'ui.ws.documents.uploaded', successParams: { name } },
		);
		this.busy = false;
		if (stored) this.discard();
		return !!stored;
	}

	discard() {
		for (const page of this.pages) if (page.rendered) URL.revokeObjectURL(page.rendered.preview);
		this.pages = [];
	}

	async #rerender(id: string) {
		const page = this.pages.find((candidate) => candidate.id === id);
		if (!page) return;
		const rendered = await this.#render(page.file, page.settings).catch(() => null);
		if (page.rendered) URL.revokeObjectURL(page.rendered.preview);
		this.pages = this.pages.map((candidate) => (candidate.id === id ? { ...candidate, rendered } : candidate));
	}
}
