import type { MailMessage } from './mailer.ts';

interface InvitationMail {
	tenant: string;
	role: string;
	link: string;
	locale: 'de-CH' | 'en-US';
	logo: string | null;
	firstName?: string;
	description?: string;
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function invitationMail(input: InvitationMail): Omit<MailMessage, 'to'> {
	const { tenant, link, role, locale, logo, firstName } = input;
	const de = locale === 'de-CH';
	const subject = de ? `Deine Einladung zu ${tenant} auf CLinks` : `Your invitation to ${tenant} on CLinks`;
	const heading = de ? 'Deine Einladung zu CLinks' : 'Your invitation to CLinks';
	const greeting = de
		? firstName
			? 'Guten Tag ' + firstName
			: 'Guten Tag'
		: firstName
			? 'Hello ' + firstName
			: 'Hello';
	const body =
		input.description ??
		(de
			? `${tenant} lädt dich zu CLinks ein. Deine Rolle im Team ist «${role}».`
			: `${tenant} has invited you to CLinks. Your team role is “${role}”.`);
	const action = de ? 'Einladung annehmen' : 'Accept invitation';
	const expiry = de ? 'Dein persönlicher Link ist 72 Stunden gültig.' : 'Your personal link is valid for 72 hours.';
	const footer = de ? 'Versendet über CLinks für ' + tenant : 'Sent via CLinks for ' + tenant;
	const image = logo?.match(/^data:image\/(png|jpeg);base64,([a-z0-9+/=]+)$/i);
	const attachments = image
		? [
				{
					filename: 'logo.' + image[1],
					content: Buffer.from(image[2], 'base64'),
					contentType: 'image/' + image[1],
					cid: 'tenant-logo@clinks',
				},
			]
		: [];
	const brand = image
		? `<img src="cid:tenant-logo@clinks" alt="${escapeHtml(tenant)}" style="display:block;max-width:150px;max-height:48px;width:auto;height:auto">`
		: `<strong>${escapeHtml(tenant)}</strong>`;
	const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f3f4ef;font:16px/1.55 Arial,sans-serif;color:#26392f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" bgcolor="#ffffff" cellpadding="0" cellspacing="0" style="max-width:540px;border:1px solid #dae2d9;border-radius:9px;text-align:left"><tr><td style="padding:27px 25px 22px">${brand}</td></tr><tr><td style="padding:0 25px"><div style="border-top:2px solid #28563d"></div><h1 style="color:#143e31;font:bold 29px/1.12 Arial,sans-serif;margin:28px 0 20px">${heading}</h1><p style="margin:0 0 10px"><b>${escapeHtml(greeting)}</b></p><p style="margin:0 0 23px">${escapeHtml(body)}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#28563d" style="border-radius:6px;padding:14px 21px"><a style="color:#fff;text-decoration:none;font:bold 15px Arial,sans-serif" href="${escapeHtml(link)}">${action}</a></td></tr></table><p style="color:#506258;font:13px/1.55 Arial,sans-serif;margin:19px 0 27px">${expiry}</p></td></tr><tr><td style="border-top:1px solid #dae2d9;padding:16px 25px;font:12px/1.5 Arial,sans-serif;color:#506258">${escapeHtml(footer)}</td></tr></table></td></tr></table></body></html>`;
	return { subject, html, text: [greeting, body, action + '\n' + link, expiry, footer].join('\n\n'), attachments };
}
