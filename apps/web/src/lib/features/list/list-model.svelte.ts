import type { Component } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { listPress, pressInput, rangeBetween, type OpenOn } from './list-press.ts';

/** A choice inside an action's submenu, e.g. one folder of «Move to». */
export interface ListChoice {
	id: string;
	label: string;
	icon?: Component;
	run: () => unknown;
}

/**
 * Something to do with one or several entries. One definition feeds every place the action appears: the
 * buttons on a hovered row, the right-click menu, the bar for several selected entries, swiping on a phone and
 * the keyboard.
 */
export interface ListAction<T> {
	id: string;
	label: (items: T[]) => string;
	icon: (items: T[]) => Component;
	run: (items: T[]) => unknown;
	/** Whether the action applies to these entries; omitted: always. */
	when?: (items: T[]) => boolean;
	/** Only for one entry at a time, e.g. rename. */
	single?: boolean;
	destructive?: boolean;
	/** Shown as a button on the hovered row. */
	inline?: boolean;
	/** A toggle that is on for these entries, e.g. starred. */
	pressed?: (items: T[]) => boolean;
	/** How the icon of a pressed toggle looks, e.g. a filled star. */
	pressedClass?: string;
	/** A submenu instead of a single step. */
	choices?: (items: T[]) => ListChoice[];
	/** The key that runs it, e.g. `Delete` or `s`, shown in menus and handled by the list. */
	key?: string;
}

export interface ListOptions<T, Id extends string> {
	/** The list's accessible name, e.g. the mail folder. */
	name: () => string;
	items: () => T[];
	id: (item: T) => Id;
	/** The entry's name, for the labels of its checkbox and menus. */
	label: (item: T) => string;
	actions: () => ListAction<T>[];
	open: (item: T) => void;
	openOn?: OpenOn;
	/** Actions run by swiping a row on a touch screen: `start` to the right, `end` to the left. */
	swipe?: { start?: string; end?: string };
	/** Starts dragging an entry with the mouse, e.g. onto a folder; omitted: rows do not drag. */
	drag?: (event: DragEvent, item: T) => void;
}

/** Selection and actions of a list, shared by mail, documents and the other lists. */
export class ListModel<T, Id extends string = string> {
	readonly ids = new SvelteSet<Id>();
	/** Where a Shift-click range starts: the last entry clicked. */
	anchor = $state<Id | null>(null);
	/** A long press on a touch screen started picking several entries. */
	picking = $state(false);
	readonly #options: ListOptions<T, Id>;

	constructor(options: ListOptions<T, Id>) {
		this.#options = options;
	}

	get name(): string {
		return this.#options.name();
	}

	get items(): T[] {
		return this.#options.items();
	}

	get openOn(): OpenOn {
		return this.#options.openOn ?? 'click';
	}

	get drag(): ((event: DragEvent, item: T) => void) | undefined {
		return this.#options.drag;
	}

	id(item: T): Id {
		return this.#options.id(item);
	}

	label(item: T): string {
		return this.#options.label(item);
	}

	/** The selected entries still in the list, in list order. */
	get selected(): T[] {
		return this.items.filter((item) => this.ids.has(this.id(item)));
	}

	/** Several entries picked: the bar for all of them shows. */
	get many(): boolean {
		return this.picking || this.selected.length > 1;
	}

	has(item: T): boolean {
		return this.ids.has(this.id(item));
	}

	press(event: MouseEvent, item: T) {
		const id = this.id(item);
		switch (listPress(pressInput(event, this.picking, this.openOn))) {
			case 'toggle':
				return this.toggle(item);
			case 'range':
				this.ids.clear();
				for (const each of rangeBetween(
					this.items.map((entry) => this.id(entry)),
					this.anchor,
					id,
				))
					this.ids.add(each);
				return;
			case 'mark':
				return this.only(item);
			case 'open':
				this.only(item);
				return this.#options.open(item);
		}
	}

	toggle(item: T) {
		const id = this.id(item);
		if (this.ids.has(id)) this.ids.delete(id);
		else this.ids.add(id);
		this.anchor = id;
		if (this.ids.size === 0) this.picking = false;
	}

	/** A long press: starts picking with this entry. */
	pick(item: T) {
		this.picking = true;
		if (!this.has(item)) this.toggle(item);
	}

	only(item: T) {
		this.ids.clear();
		this.ids.add(this.id(item));
		this.anchor = this.id(item);
	}

	/** Right-click on an entry outside the selection selects it alone, as in Explorer. */
	focusMenu(item: T) {
		if (!this.has(item)) this.only(item);
	}

	selectAll() {
		for (const item of this.items) this.ids.add(this.id(item));
	}

	clear() {
		this.ids.clear();
		this.picking = false;
	}

	/** The actions for a right-click or the bar: for the selection when the entry is part of it, else the entry. */
	targets(item?: T): T[] {
		if (!item) return this.selected;
		return this.has(item) ? this.selected : [item];
	}

	actionsFor(items: T[]): ListAction<T>[] {
		if (items.length === 0) return [];
		return this.#options
			.actions()
			.filter((action) => (!action.single || items.length === 1) && (action.when?.(items) ?? true));
	}

	inline(item: T): ListAction<T>[] {
		return this.actionsFor([item]).filter((action) => action.inline);
	}

	swipe(side: 'start' | 'end', item: T): ListAction<T> | null {
		const id = this.#options.swipe?.[side];
		return this.actionsFor([item]).find((action) => action.id === id && !action.choices) ?? null;
	}

	async run(action: ListAction<T>, items: T[]) {
		await action.run(items);
		if (items.length > 1 || action.destructive) this.clear();
	}

	async choose(choice: ListChoice, items: T[]) {
		await choice.run();
		if (items.length > 1) this.clear();
	}

	/** Keys on the list: Ctrl+A selects all, Escape clears, an action's key runs it on the selection. */
	keydown(event: KeyboardEvent): boolean {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
			this.selectAll();
			return true;
		}
		if (event.key === 'Escape' && this.ids.size > 0) {
			this.clear();
			return true;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return false;
		const items = this.selected;
		const action = this.actionsFor(items).find(
			(candidate) => candidate.key && !candidate.choices && candidate.key.toLowerCase() === event.key.toLowerCase(),
		);
		if (!action) return false;
		void this.run(action, items);
		return true;
	}
}
