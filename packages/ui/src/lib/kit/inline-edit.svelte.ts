export type InlineFieldKind = 'text' | 'email' | 'tel' | 'date' | 'number' | 'textarea' | 'select' | 'masked';

export interface InlineOption {
	value: string;
	label: string;
}

/** One attribute row: label left, value right, click the value to edit it in place. */
export interface InlineFieldSpec {
	key: string;
	label: string;
	value: string;
	kind?: InlineFieldKind;
	/** Shown instead of the raw value when not editing (formatted date, option label …). */
	display?: string;
	/** Muted suffix after the display value, e.g. the age after a birth date. */
	hint?: string;
	options?: InlineOption[];
	mono?: boolean;
	readonly?: boolean;
	/** Optional fields can be removed again and are offered under "Feld hinzufügen". */
	removable?: boolean;
	validate?: (value: string) => string | null;
}

export type InlineSave = (value: string) => unknown;

/** Edit state of one in-place field: Enter or blur saves, Escape restores. */
export class InlineEditor {
	editing = $state(false);
	draft = $state('');
	saving = $state(false);
	error = $state<string | null>(null);
	#initial = '';
	#save: InlineSave;
	#validate: ((value: string) => string | null) | undefined;

	constructor(save: InlineSave, validate?: (value: string) => string | null) {
		this.#save = save;
		this.#validate = validate;
	}

	get dirty() {
		return this.draft !== this.#initial;
	}

	start(value: string) {
		if (this.editing) return;
		this.#initial = value;
		this.draft = value;
		this.error = null;
		this.editing = true;
	}

	cancel() {
		this.draft = this.#initial;
		this.error = null;
		this.editing = false;
	}

	/** Saves the draft; stays in edit mode when validation or the save fails. */
	async commit(): Promise<boolean> {
		if (!this.editing || this.saving) return false;
		const value = this.draft.trim();
		if (value === this.#initial.trim()) {
			this.editing = false;
			return true;
		}
		const problem = this.#validate?.(value) ?? null;
		if (problem) {
			this.error = problem;
			return false;
		}
		this.saving = true;
		try {
			const result = await this.#save(value);
			if (result === false || result === null) return false;
			this.#initial = value;
			this.editing = false;
			return true;
		} finally {
			this.saving = false;
		}
	}

	/** Keyboard contract shared by all inline inputs. */
	keydown(event: KeyboardEvent, multiline = false) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			this.cancel();
		} else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void this.commit();
		}
	}
}

/** Masks all but the last characters of identifiers such as AHV or IBAN numbers. */
export function maskValue(value: string, visible = 2): string {
	let seen = 0;
	return [...value]
		.reverse()
		.map((character) => {
			if (!/[0-9a-z]/i.test(character)) return character;
			seen += 1;
			return seen <= visible ? character : '•';
		})
		.reverse()
		.join('');
}
