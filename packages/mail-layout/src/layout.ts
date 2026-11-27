/**
 * One layout for every mail a workspace sends: a narrow column, the workspace's name in its colour, plain
 * paragraphs, at most a few buttons, the signature and a footer. Each mail also has a text form with the same
 * content. No images, no tracking pixels, no rewritten links.
 */

export type MailBlock = { kind: 'text'; text: string } | { kind: 'button'; label: string; href: string };

export interface MailContent {
	/** Shown by mail apps next to the subject; hidden in the body. */
	preheader?: string;
	blocks: MailBlock[];
	signature?: string;
}

export interface MailBrand {
	name: string;
	/** `#rrggbb`; text on it switches to dark when white would be hard to read. */
	color: string;
	/** Lines of the workspace's address, for the footer. */
	footer: string[];
}

export interface MailExtras {
	/** Newsletters: a visible unsubscribe link at the very end. */
	unsubscribe?: { label: string; href: string };
	/** `de-CH` or `en-US`, for the document language. */
	locale?: string;
}

export interface RenderedMail {
	html: string;
	text: string;
}

/**
 * Blocks from a translated text: paragraphs are separated by a blank line; a paragraph that is only a link becomes a
 * button with `linkLabel`, or stays a link when there is no label.
 */
export function blocksFromText(text: string, linkLabel?: string): MailBlock[] {
	return text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map((paragraph) =>
			linkLabel && /^https?:\/\/\S+$/.test(paragraph)
				? { kind: 'button', label: linkLabel, href: paragraph }
				: { kind: 'text', text: paragraph },
		);
}

export function renderMail(content: MailContent, brand: MailBrand, extras: MailExtras = {}): RenderedMail {
	return { html: html(content, brand, extras), text: text(content, brand, extras) };
}

function text(content: MailContent, brand: MailBrand, extras: MailExtras) {
	const parts = content.blocks.map((block) => (block.kind === 'text' ? block.text : `${block.label}: ${block.href}`));
	if (content.signature) parts.push(content.signature);
	parts.push(['--', brand.name, ...brand.footer].join('\n'));
	if (extras.unsubscribe) parts.push(`${extras.unsubscribe.label}: ${extras.unsubscribe.href}`);
	return `${parts.join('\n\n')}\n`;
}

const ink = '#1f2328';
const muted = '#59636e';

function html(content: MailContent, brand: MailBrand, extras: MailExtras) {
	const accent = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : '#18181b';
	const onAccent = contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : ink;
	const body = content.blocks
		.map((block) =>
			block.kind === 'text'
				? `<p style="margin:0 0 16px;line-height:1.55">${multiline(block.text)}</p>`
				: `<p style="margin:24px 0"><a href="${escape(block.href)}" style="display:inline-block;background:${accent};color:${onAccent};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escape(block.label)}</a></p>`,
		)
		.join('\n');
	const signature = content.signature
		? `<p style="margin:24px 0 0;line-height:1.55;color:${ink}">${multiline(content.signature)}</p>`
		: '';
	const unsubscribe = extras.unsubscribe
		? `<p style="margin:12px 0 0"><a href="${escape(extras.unsubscribe.href)}" style="color:${muted}">${escape(extras.unsubscribe.label)}</a></p>`
		: '';
	return `<!doctype html>
<html lang="${escape(extras.locale ?? 'de-CH')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(brand.name)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escape(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border-top:4px solid ${accent}">
<tr><td style="padding:28px 28px 8px;font:600 18px/1.3 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink}">${escape(brand.name)}</td></tr>
<tr><td style="padding:12px 28px 28px;font:16px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink}">
${body}
${signature}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:16px 28px;font:13px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${muted}">
${[brand.name, ...brand.footer].map(escape).join('<br>')}
${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

function escape(value: string) {
	return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Line breaks kept, bare links made clickable. */
function multiline(value: string) {
	return escape(value)
		.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:inherit">${url}</a>`)
		.replace(/\n/g, '<br>');
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrast(first: string, second: string) {
	const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

function luminance(color: string) {
	const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
	const [r, g, b] = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
