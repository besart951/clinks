import type { Contact } from '../../domain/types.ts';

/** Placeholders usable in templates and campaigns; replaced per recipient. */
export const placeholders = ['vorname', 'nachname', 'firma', 'anrede'] as const;

export function fillPlaceholders(
	text: string,
	contact: Pick<Contact, 'firstName' | 'lastName' | 'companyName' | 'kind'> | null,
	company: string,
): string {
	const values: { [key: string]: string } = {
		vorname: contact?.firstName ?? '',
		nachname: contact?.lastName ?? contact?.companyName ?? '',
		firma: company,
		anrede:
			contact?.kind === 'company'
				? contact.companyName
				: `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim(),
	};
	return text.replace(/\{(vorname|nachname|firma|anrede)\}/g, (_, key: string) => values[key]);
}

export type CampaignCheck = {
	key: string;
	level: 'error' | 'warning' | 'ok';
	params?: { [name: string]: string | number };
};

const spamWords = ['gratis', 'kostenlos!!', 'gewinn', '100%', 'jetzt kaufen', 'free'];

/** Content checks shown next to the campaign editor before it goes out. */
export function campaignChecks(
	campaign: { subject: string; previewText: string; body: string; audienceTag: string },
	recipients: number,
): CampaignCheck[] {
	const checks: CampaignCheck[] = [];
	const subject = campaign.subject.trim();
	if (!subject) checks.push({ key: 'ui.ws.campaign.check_subject_missing', level: 'error' });
	else if (subject.length < 15) checks.push({ key: 'ui.ws.campaign.check_subject_short', level: 'warning' });
	else if (subject.length > 70) checks.push({ key: 'ui.ws.campaign.check_subject_long', level: 'warning' });
	else checks.push({ key: 'ui.ws.campaign.check_subject_ok', level: 'ok' });
	if (subject && subject === subject.toUpperCase() && /[A-Z]/.test(subject))
		checks.push({ key: 'ui.ws.campaign.check_caps', level: 'warning' });
	const lower = `${subject} ${campaign.body}`.toLowerCase();
	const spam = spamWords.find((word) => lower.includes(word));
	if (spam || lower.includes('!!'))
		checks.push({ key: 'ui.ws.campaign.check_spam', level: 'warning', params: { word: spam ?? '!!' } });
	if (!campaign.previewText.trim()) checks.push({ key: 'ui.ws.campaign.check_preview_missing', level: 'warning' });
	if (/\{(vorname|anrede)\}/.test(campaign.body)) checks.push({ key: 'ui.ws.campaign.check_personal', level: 'ok' });
	else checks.push({ key: 'ui.ws.campaign.check_not_personal', level: 'warning' });
	if (!campaign.audienceTag || recipients === 0)
		checks.push({ key: 'ui.ws.campaign.check_no_recipients', level: 'error' });
	else checks.push({ key: 'ui.ws.campaign.check_recipients', level: 'ok', params: { count: recipients } });
	checks.push({ key: 'ui.ws.campaign.check_unsubscribe', level: 'ok' });
	return checks;
}
