import type { MailMessage } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** Which mailboxes announce new mail on this device: by address, plus `other` for every other address. */
export type MailAlertChoice = { [address: string]: boolean };

const key = 'clinks.workspace.mail.alerts';

/** The device's choice; every mailbox announces until turned off. */
export function readAlertChoice(workspace: Workspace): MailAlertChoice {
	return workspace.platform.preferences.read<MailAlertChoice>(key, {});
}

export function writeAlertChoice(workspace: Workspace, choice: MailAlertChoice) {
	workspace.platform.preferences.write(key, choice);
}

/** Whether a mail to these addresses is announced: the first chosen mailbox it went to decides, else `other`. */
export function announces(choice: MailAlertChoice, to: string[]): boolean {
	const address = to.map((entry) => entry.toLowerCase()).find((entry) => entry in choice);
	return address ? choice[address] : (choice.other ?? true);
}

/**
 * New mail in the inbox as a system notification while CLinks is in the background, for the mailboxes chosen
 * in the profile and only with notifications on («Push»). The first load announces nothing.
 */
export class MailAlerts {
	readonly resource: Resource<MailMessage[]>;
	#seen: Set<string> | null = null;
	readonly #workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['mails'], async () => {
			const mails = await workspace.api.mails.list((row) => row.folder === 'inbox' && !row.read);
			this.#announce(mails);
			return mails;
		});
	}

	#announce(mails: MailMessage[]) {
		const fresh = this.#seen ? mails.filter((mail) => !this.#seen!.has(mail.id)) : [];
		this.#seen = new Set(mails.map((mail) => mail.id));
		if (!this.#workspace.session.user?.notificationPreferences.push || fresh.length === 0) return;
		const choice = readAlertChoice(this.#workspace);
		for (const mail of fresh.filter((candidate) => announces(choice, candidate.to)))
			this.#workspace.platform.notifier.notify(
				this.#workspace.t('ui.ws.mail.alert_title', { name: mail.fromName || mail.from }),
				mail.subject || this.#workspace.t('ui.ws.mail.no_subject'),
			);
	}
}
