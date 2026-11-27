import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { blocksFromText, contrast, renderMail } from '../src/layout.ts';

const brand = { name: 'Praxis <Sonne>', color: '#0f766e', footer: ['Zentralplatz 1', '2502 Biel'] };

describe('mail layout', () => {
	it('turns a translated text into paragraphs and a button for a link on its own line', () => {
		assert.deepEqual(blocksFromText('Guten Tag\n\nhttps://app.clinks.ch/#/x\n\nGruss', 'Öffnen'), [
			{ kind: 'text', text: 'Guten Tag' },
			{ kind: 'button', label: 'Öffnen', href: 'https://app.clinks.ch/#/x' },
			{ kind: 'text', text: 'Gruss' },
		]);
		assert.deepEqual(blocksFromText('https://x.ch'), [{ kind: 'text', text: 'https://x.ch' }]);
	});

	it('renders HTML and text with the same content, escaped, without images or tracking', () => {
		const mail = renderMail(
			{
				preheader: 'Kurz',
				blocks: [
					{ kind: 'text', text: 'Hallo <b>Lea</b>\nzweite Zeile' },
					{ kind: 'button', label: 'Ansehen', href: 'https://a.ch/?x="1"' },
				],
				signature: 'Anna\nPraxis Sonne',
			},
			brand,
			{ unsubscribe: { label: 'Abmelden', href: 'https://a.ch/u/1' } },
		);
		assert.match(mail.html, /Hallo &#60;b&#62;Lea&#60;\/b&#62;<br>zweite Zeile/);
		assert.match(mail.html, /href="https:\/\/a\.ch\/\?x=&#34;1&#34;"/);
		assert.match(mail.html, /Praxis &#60;Sonne&#62;/);
		assert.doesNotMatch(mail.html, /<img|<script/);
		assert.equal(
			mail.text,
			'Hallo <b>Lea</b>\nzweite Zeile\n\nAnsehen: https://a.ch/?x="1"\n\nAnna\nPraxis Sonne\n\n--\nPraxis <Sonne>\nZentralplatz 1\n2502 Biel\n\nAbmelden: https://a.ch/u/1\n',
		);
	});

	it('keeps button text readable on light brand colours', () => {
		assert.ok(contrast('#ffffff', '#000000') > 20);
		const light = renderMail(
			{ blocks: [{ kind: 'button', label: 'Go', href: 'https://a.ch' }] },
			{ ...brand, color: '#facc15' },
		);
		assert.match(light.html, /background:#facc15;color:#1f2328/);
		const dark = renderMail({ blocks: [{ kind: 'button', label: 'Go', href: 'https://a.ch' }] }, brand);
		assert.match(dark.html, /background:#0f766e;color:#ffffff/);
	});
});
