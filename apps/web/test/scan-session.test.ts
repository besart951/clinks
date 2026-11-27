import { describe, expect, it } from 'vitest';
import { ScanSession } from '../src/lib/features/documents/scan-session.svelte';
import type { Workspace } from '../src/lib/workspace.svelte';

const workspace = {
	t: (key: string) => key,
	i18n: { date: () => '27.11.2026', time: () => '21:45' },
} as unknown as Workspace;
const rendered: string[] = [];
const render = async (file: File, settings: { rotate: number }) => {
	rendered.push(`${file.name}@${settings.rotate}`);
	return { jpeg: new Uint8Array([0xff, 0xd8]), width: 10, height: 14, preview: `blob:${file.name}` };
};

describe('scan session', () => {
	it('renders each photo as a page, turns and orders them', async () => {
		const session = new ScanSession(workspace, render);
		await session.add([new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')]);
		expect(session.pages.map((page) => page.rendered?.preview)).toEqual(['blob:a.jpg', 'blob:b.jpg']);
		expect(session.ready).toBe(true);
		session.rotate(session.pages[0].id);
		await Promise.resolve();
		await Promise.resolve();
		expect(rendered).toContain('a.jpg@90');
		session.move(session.pages[1].id, -1);
		expect(session.pages.map((page) => page.file.name)).toEqual(['b.jpg', 'a.jpg']);
		session.remove(session.pages[0].id);
		expect(session.pages).toHaveLength(1);
		session.name = '  ';
		expect(session.ready).toBe(false);
	});
});
