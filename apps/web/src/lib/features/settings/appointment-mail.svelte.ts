import { toast } from 'svelte-sonner';
import { defaultAppointmentMail, type AppointmentMailSettings } from '@clinks/domain/appointment-mail';
import type { Workspace } from '../../workspace.svelte.ts';

/** Settings › E-Mail › Termine: confirmations and reminders, off until the workspace turns them on. */
export class AppointmentMailModel {
	value = $state<AppointmentMailSettings>({ ...defaultAppointmentMail });
	loaded = $state(false);
	busy = $state(false);
	fields = $state<Record<string, string>>({});
	#saved = $state('');
	readonly #workspace: Workspace;

	dirty = $derived(this.loaded && JSON.stringify(this.value) !== this.#saved);

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	async load() {
		this.value = await this.#workspace.mailSettings.appointmentMail();
		this.#saved = JSON.stringify(this.value);
		this.loaded = true;
	}

	async save() {
		this.busy = true;
		this.fields = {};
		try {
			await this.#workspace.mailSettings.saveAppointmentMail($state.snapshot(this.value));
			this.#saved = JSON.stringify(this.value);
			toast.success(this.#workspace.t('ui.ws.appointment_mail.saved'));
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
		} finally {
			this.busy = false;
		}
	}
}
