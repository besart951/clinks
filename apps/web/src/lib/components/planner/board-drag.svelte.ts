import { tick } from 'svelte';
import type { TaskId } from '@clinks/domain/ids';
import type { Task, TaskStatus } from '@clinks/domain/types';

export interface DropTarget {
	status: TaskStatus;
	index: number;
}

/** What the board needs from its page: permissions, tasks and the actual move. */
export interface BoardDragHost {
	canWrite(): boolean;
	find(id: string): Task | null;
	/** Moves the task; must apply the new position synchronously before its first `await`. */
	move(task: Task, target: DropTarget): Promise<void>;
}

interface Session {
	id: TaskId;
	pointerId: number;
	touch: boolean;
	armed: boolean;
	started: boolean;
	start: { x: number; y: number };
	pointer: { x: number; y: number };
	/** Where the card sat when it was picked up, and where the pointer grabbed it. */
	origin: DOMRect;
	grab: { x: number; y: number };
	item: HTMLElement;
	from: TaskStatus;
	timer?: ReturnType<typeof setTimeout>;
	frame?: number;
}

const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
const spring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
/** Pixels a mouse must move before a press becomes a drag, and the hold time that arms a touch drag. */
const mouseThreshold = 5;
const touchHold = 280;
const touchSlop = 8;
const edge = 56;

function reducedMotion() {
	return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cards(root: ParentNode) {
	return [...root.querySelectorAll<HTMLElement>('[data-card]')];
}

/**
 * Runs `change` and lets every card that moved glide from its old to its new place (FLIP). Cards are matched by
 * `data-card`, so a card that Svelte re-created in another column is animated too.
 */
export async function flip(root: HTMLElement, change: () => void, skip?: string) {
	const before = new Map(cards(root).map((card) => [card.dataset.card, card.getBoundingClientRect()]));
	change();
	await tick();
	if (reducedMotion()) return;
	for (const card of cards(root)) {
		const from = before.get(card.dataset.card);
		if (!from || card.dataset.card === skip || card.hasAttribute('data-lifted')) continue;
		const to = card.getBoundingClientRect();
		const dx = from.left - to.left;
		const dy = from.top - to.top;
		if (dx || dy)
			card.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 320, easing: ease });
	}
}

/** The short spring a card plays when it lands. */
export function land(card: Element | null) {
	if (!card || reducedMotion()) return;
	card.animate([{ scale: 1.04 }, { scale: 1 }], { duration: 320, easing: spring });
}

/**
 * Pointer drag & drop for the task board. The real card is lifted (no clone): it leaves the flow as a fixed
 * element that follows one pointer, a dashed slot marks where it will land, and the other cards glide aside.
 * Mouse drags start after 5px, touch drags after a 280ms hold so a swipe still scrolls.
 */
export class BoardDrag {
	liftedId = $state<TaskId | null>(null);
	/** Where the lifted card would land, with the height its slot needs. */
	target = $state<(DropTarget & { height: number }) | null>(null);
	/** The column whose counter just changed, for a short bump. */
	bumped = $state<TaskStatus | null>(null);
	#host: BoardDragHost;
	#board: HTMLElement | null = null;
	#session: Session | null = null;
	#swallowClick = false;

	constructor(host: BoardDragHost) {
		this.#host = host;
	}

	/** Svelte attachment for the board element. */
	attach(board: HTMLElement) {
		this.#board = board;
		const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
			[board, 'pointerdown', (event) => this.#down(event as PointerEvent)],
			[board, 'click', (event) => this.#click(event), { capture: true }],
			[board, 'contextmenu', (event) => this.#contextMenu(event)],
			[window, 'pointermove', (event) => this.#pointerMove(event as PointerEvent)],
			[window, 'pointerup', (event) => this.#up(event as PointerEvent)],
			[window, 'pointercancel', (event) => this.#cancelPointer(event as PointerEvent)],
			[window, 'keydown', (event) => this.#key(event as KeyboardEvent), { capture: true }],
			// Once a touch drag is armed, the page must not scroll under the finger.
			[document, 'touchmove', (event) => this.#touchMove(event), { passive: false }],
		];
		for (const [target, type, listener, options] of listeners) target.addEventListener(type, listener, options);
		return () => {
			for (const [target, type, listener, options] of listeners) target.removeEventListener(type, listener, options);
			if (this.#session) void this.#finish(false);
			this.#board = null;
		};
	}

	bump(status: TaskStatus) {
		this.bumped = status;
		setTimeout(() => {
			if (this.bumped === status) this.bumped = null;
		}, 320);
	}

	#down(event: PointerEvent) {
		if (this.#session || event.button !== 0 || !event.isPrimary || !this.#host.canWrite()) return;
		const element = event.target as Element;
		const item = element.closest<HTMLElement>('[data-card]');
		if (!item || element.closest('[data-no-drag]')) return;
		const column = item.closest<HTMLElement>('[data-column]');
		const id = item.dataset.card as TaskId;
		const touch = event.pointerType !== 'mouse';
		const session: Session = {
			id,
			pointerId: event.pointerId,
			touch,
			armed: !touch,
			started: false,
			start: { x: event.clientX, y: event.clientY },
			pointer: { x: event.clientX, y: event.clientY },
			origin: item.getBoundingClientRect(),
			grab: { x: 0, y: 0 },
			item,
			from: column?.dataset.column as TaskStatus,
		};
		if (touch)
			session.timer = setTimeout(() => {
				if (this.#session !== session) return;
				session.armed = true;
				item.setAttribute('data-armed', '');
				navigator.vibrate?.(8);
			}, touchHold);
		this.#session = session;
	}

	#pointerMove(event: PointerEvent) {
		const session = this.#session;
		if (!session || event.pointerId !== session.pointerId) return;
		session.pointer = { x: event.clientX, y: event.clientY };
		if (!session.started) {
			const moved = Math.abs(event.clientX - session.start.x) + Math.abs(event.clientY - session.start.y);
			if (!session.armed) {
				if (moved > touchSlop) this.#drop();
				return;
			}
			if (!session.touch && moved < mouseThreshold) return;
			void this.#lift(session);
			return;
		}
		this.#follow(session);
		this.#retarget(session);
	}

	async #lift(session: Session) {
		const board = this.#board;
		if (!board) return;
		session.started = true;
		session.item.removeAttribute('data-armed');
		const rect = session.item.getBoundingClientRect();
		session.origin = rect;
		session.grab = { x: session.start.x - rect.left, y: session.start.y - rect.top };
		board.setPointerCapture(session.pointerId);
		document.documentElement.setAttribute('data-board-dragging', '');
		const index = this.#indexIn(session.item.closest('[data-column]'), session.item);
		await flip(
			board,
			() => {
				Object.assign(session.item.style, {
					left: `${rect.left}px`,
					top: `${rect.top}px`,
					width: `${rect.width}px`,
				});
				session.item.setAttribute('data-lifted', '');
				this.liftedId = session.id;
				this.target = { status: session.from, index, height: rect.height };
			},
			session.id,
		);
		this.#follow(session);
		this.#scrollLoop(session);
	}

	#follow(session: Session) {
		const dx = session.pointer.x - session.grab.x - session.origin.left;
		const dy = session.pointer.y - session.grab.y - session.origin.top;
		session.item.style.translate = `${dx}px ${dy}px`;
	}

	/** Finds the column under the pointer and the slot by layout midpoints, which ignore running animations. */
	#retarget(session: Session) {
		const board = this.#board;
		if (!board || !this.target) return;
		const under = document.elementFromPoint(session.pointer.x, session.pointer.y);
		const column = under?.closest<HTMLElement>('[data-column]');
		if (!column || !board.contains(column)) return;
		const status = column.dataset.column as TaskStatus;
		const list = column.querySelector<HTMLElement>('[data-list]');
		if (!list) return;
		const y = session.pointer.y - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
		const siblings = cards(list).filter((card) => !card.hasAttribute('data-lifted'));
		const next = siblings.findIndex((card) => y < card.offsetTop + card.offsetHeight / 2);
		const index = next === -1 ? siblings.length : next;
		if (this.target.status === status && this.target.index === index) return;
		const height = this.target.height;
		void flip(board, () => (this.target = { status, index, height }), session.id);
	}

	#indexIn(column: Element | null, item: HTMLElement) {
		return column ? cards(column).indexOf(item) : 0;
	}

	/** Scrolls the board sideways and the page up or down while the pointer is near an edge. */
	#scrollLoop(session: Session) {
		const board = this.#board;
		if (!board) return;
		let last = performance.now();
		const step = (now: number) => {
			if (this.#session !== session) return;
			const factor = Math.min((now - last) / 16, 3);
			last = now;
			const { x, y } = session.pointer;
			const rect = board.getBoundingClientRect();
			const speed = (distance: number) => Math.min(24, ((edge - distance) / edge) * 18) * factor;
			const horizontal =
				x > rect.right - edge ? speed(rect.right - x) : x < rect.left + edge ? -speed(x - rect.left) : 0;
			const vertical = y > innerHeight - edge ? speed(innerHeight - y) : y < edge ? -speed(y) : 0;
			if (horizontal) board.scrollLeft += horizontal;
			if (vertical) scrollBy(0, vertical);
			const scrolled = horizontal !== 0 || vertical !== 0;
			if (scrolled) this.#retarget(session);
			session.frame = requestAnimationFrame(step);
		};
		session.frame = requestAnimationFrame(step);
	}

	#up(event: PointerEvent) {
		const session = this.#session;
		if (!session || event.pointerId !== session.pointerId) return;
		if (session.started) void this.#finish(true);
		else this.#drop();
	}

	#cancelPointer(event: PointerEvent) {
		if (this.#session?.pointerId === event.pointerId) void this.#finish(false);
	}

	#key(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !this.#session?.started) return;
		event.preventDefault();
		event.stopPropagation();
		void this.#finish(false);
	}

	#touchMove(event: Event) {
		if (this.#session?.touch && (this.#session.armed || this.#session.started)) event.preventDefault();
	}

	#contextMenu(event: Event) {
		if ((event.target as Element).closest('[data-card]')) event.preventDefault();
	}

	/** The click that follows a drag must not open the task. */
	#click(event: Event) {
		if (!this.#swallowClick) return;
		this.#swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	/** Forgets a press that never became a drag. */
	#drop() {
		const session = this.#session;
		if (!session) return;
		clearTimeout(session.timer);
		session.item.removeAttribute('data-armed');
		this.#session = null;
	}

	/** Lands the card in its slot (`commit`) or back where it came from, then animates it into place. */
	async #finish(commit: boolean) {
		const session = this.#session;
		const board = this.#board;
		if (!session || !board) return;
		this.#session = null;
		clearTimeout(session.timer);
		if (session.frame) cancelAnimationFrame(session.frame);
		if (board.hasPointerCapture(session.pointerId)) board.releasePointerCapture(session.pointerId);
		document.documentElement.removeAttribute('data-board-dragging');
		this.#swallowClick = true;
		setTimeout(() => (this.#swallowClick = false), 0);
		const released = session.item.getBoundingClientRect();
		const target = this.target;
		const task = this.#host.find(session.id);
		const moves = commit && target !== null && task !== null;
		await flip(
			board,
			() => {
				session.item.removeAttribute('data-lifted');
				for (const property of ['left', 'top', 'width', 'translate']) session.item.style.removeProperty(property);
				this.liftedId = null;
				this.target = null;
				if (moves) void this.#host.move(task, target);
			},
			session.id,
		);
		const card = board.querySelector<HTMLElement>(`[data-card="${session.id}"]`);
		if (card && !reducedMotion()) {
			const to = card.getBoundingClientRect();
			card.animate(
				[
					{ translate: `${released.left - to.left}px ${released.top - to.top}px`, scale: 1.03 },
					{ translate: '0 0', scale: 1 },
				],
				{ duration: 300, easing: ease },
			);
		}
		if (moves && target.status !== session.from) this.bump(target.status);
	}
}
