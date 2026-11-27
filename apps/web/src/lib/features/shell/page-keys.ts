/** One line of the shortcut overview: the keys (as printed) and what they do. */
export interface KeyHelp {
	keys: string[];
	label: string;
}

/**
 * The keys of the page in front: handled by the app's key handler once no field has focus and no leader key is
 * waiting, and listed in the «?» overview.
 */
export interface PageKeys {
	/** Handles the key; true when it did something, so the browser's default is prevented. */
	handle(event: KeyboardEvent): boolean;
	help(): KeyHelp[];
}

/** A page-level key that is not about a list entry, e.g. Backspace for the parent folder. */
export interface KeyCommand {
	key: string;
	/** The key as printed in the overview. */
	shown: string;
	label: string;
	when?: () => boolean;
	run: () => void;
}

export function commandKeys(commands: KeyCommand[]): PageKeys {
	return {
		handle(event) {
			if (event.ctrlKey || event.metaKey || event.altKey) return false;
			const command = commands.find((candidate) => candidate.key === event.key && (candidate.when?.() ?? true));
			command?.run();
			return !!command;
		},
		help: () => commands.map((command) => ({ keys: [command.shown], label: command.label })),
	};
}

/** Several key sets of one page, asked in order. */
export function combineKeys(...parts: PageKeys[]): PageKeys {
	return {
		handle: (event) => parts.some((part) => part.handle(event)),
		help: () => parts.flatMap((part) => part.help()),
	};
}

/** Keys inside an open dialog or menu belong to it, not to the page behind. */
export function insideOverlay(target: EventTarget | null) {
	return (
		target instanceof Element && !!target.closest('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')
	);
}
