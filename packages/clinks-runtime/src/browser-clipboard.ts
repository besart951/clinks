export class BrowserClipboard {
	async copy(value: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('Clipboard is unavailable.');
		await navigator.clipboard.writeText(value);
	}
}
