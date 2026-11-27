import { createContext } from 'svelte';
import type { Workspace } from '../../workspace.svelte.ts';
import type { QuickCreate } from '../shell/quick-create.svelte.ts';

/** Where a mail to an address is written: the device's mail program (mailto) or CLinks' own compose sheet. */
export type MailWay = 'system' | 'clinks';
export type MailPreference = MailWay | 'ask';

const key = 'clinks.workspace.mail.writeWith';

/**
 * «E-Mail schreiben» next to any address: asks once which program to use (and can remember it), or goes straight to
 * the mail program when the workspace has no mail module for this person.
 */
export class WriteMail {
	/** The address being asked about; the dialog is open while it is set. */
	asking = $state<string | null>(null);
	remember = $state(false);
	preference = $state<MailPreference>('ask');
	readonly #workspace: Workspace;
	readonly #quick: QuickCreate;

	constructor(workspace: Workspace, quick: QuickCreate) {
		this.#workspace = workspace;
		this.#quick = quick;
		this.preference = workspace.platform.preferences.read<MailPreference>(key, 'ask');
	}

	/** Whether CLinks can send mail for this person at all. */
	get canUseClinks() {
		const session = this.#workspace.session;
		return session.hasModule('mail') && session.can('mail.write');
	}

	write(address: string) {
		if (!this.canUseClinks) return this.#open('system', address);
		if (this.preference !== 'ask') return this.#open(this.preference, address);
		this.remember = false;
		this.asking = address;
	}

	choose(way: MailWay) {
		const address = this.asking;
		if (!address) return;
		if (this.remember) this.setPreference(way);
		this.asking = null;
		this.#open(way, address);
	}

	setPreference(preference: MailPreference) {
		this.preference = preference;
		this.#workspace.platform.preferences.write(key, preference);
	}

	#open(way: MailWay, address: string) {
		if (way === 'clinks') this.#quick.mail({ to: [address] });
		else this.#workspace.platform.files.open(`mailto:${address}`);
	}
}

export const [useWriteMail, setWriteMail] = createContext<WriteMail>();
