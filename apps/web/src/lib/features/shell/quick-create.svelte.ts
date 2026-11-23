import { createContext } from 'svelte';
import type { ContactId } from '@clinks/domain/ids';

export interface AppointmentPreset {
	contactId?: ContactId | null;
	title?: string;
}

export interface TaskPreset {
	contactId?: ContactId | null;
}

export interface MailPreset {
	to?: string[];
	subject?: string;
	body?: string;
}

interface QuickCreateSheets {
	appointment(preset: AppointmentPreset): void;
	task(preset: TaskPreset): void;
	mail(preset: MailPreset): void;
}

/**
 * Opens the "new appointment / task / mail" sheets on top of the current page, so adding something never
 * navigates away. The sheets live once in the app shell and register themselves here.
 */
export class QuickCreate {
	#sheets: QuickCreateSheets | null = null;

	register(sheets: QuickCreateSheets) {
		this.#sheets = sheets;
		return () => {
			if (this.#sheets === sheets) this.#sheets = null;
		};
	}

	appointment(preset: AppointmentPreset = {}) {
		this.#sheets?.appointment(preset);
	}

	task(preset: TaskPreset = {}) {
		this.#sheets?.task(preset);
	}

	mail(preset: MailPreset = {}) {
		this.#sheets?.mail(preset);
	}
}

export const [useQuickCreate, setQuickCreate] = createContext<QuickCreate>();
