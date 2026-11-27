import { describe, expect, it, vi } from 'vitest';
import { listPress, rangeBetween, type PressInput } from '../src/lib/features/list/list-press';
import { swipeSide } from '../src/lib/features/list/row-gesture.svelte';
import { ListModel, type ListAction } from '../src/lib/features/list/list-model.svelte';

const click: PressInput = { detail: 1, ctrl: false, shift: false, touch: false, picking: false, openOn: 'double' };

describe('listPress', () => {
	it('marks on a click where a double click opens, and opens where a click does', () => {
		expect(listPress(click)).toBe('mark');
		expect(listPress({ ...click, detail: 2 })).toBe('open');
		expect(listPress({ ...click, detail: 0 })).toBe('open');
		expect(listPress({ ...click, openOn: 'click' })).toBe('open');
	});

	it('adds with Ctrl and picks a range with Shift', () => {
		expect(listPress({ ...click, ctrl: true, openOn: 'click' })).toBe('toggle');
		expect(listPress({ ...click, shift: true })).toBe('range');
	});

	it('opens on a tap, and adds once a long press started picking', () => {
		expect(listPress({ ...click, touch: true })).toBe('open');
		expect(listPress({ ...click, touch: true, picking: true })).toBe('toggle');
	});
});

describe('rangeBetween', () => {
	it('takes both ends in list order, either direction', () => {
		expect(rangeBetween(['a', 'b', 'c', 'd'], 'c', 'a')).toEqual(['a', 'b', 'c']);
		expect(rangeBetween(['a', 'b', 'c'], null, 'b')).toEqual(['b']);
	});
});

describe('swipeSide', () => {
	it('needs a third of the row', () => {
		expect(swipeSide(50, 300)).toBeNull();
		expect(swipeSide(100, 300)).toBe('start');
		expect(swipeSide(-120, 300)).toBe('end');
	});
});

describe('ListModel', () => {
	type Row = { id: string; locked: boolean };
	const rows: Row[] = [
		{ id: 'a', locked: false },
		{ id: 'b', locked: true },
		{ id: 'c', locked: false },
	];
	const remove = vi.fn();
	const actions: ListAction<Row>[] = [
		{ id: 'rename', label: () => 'Rename', icon: () => null!, single: true, run: () => undefined },
		{
			id: 'delete',
			label: () => 'Delete',
			icon: () => null!,
			destructive: true,
			key: 'Delete',
			when: (items) => items.every((item) => !item.locked),
			run: remove,
		},
	];
	const model = () =>
		new ListModel<Row>({
			t: (key) => key,
			name: () => 'Rows',
			items: () => rows,
			id: (row) => row.id,
			label: (row) => row.id,
			actions: () => actions,
			open: () => undefined,
			openOn: 'double',
		});

	it('offers single-entry actions only for one, and an action only where it applies', () => {
		const list = model();
		expect(list.actionsFor([rows[0]]).map((action) => action.id)).toEqual(['rename', 'delete']);
		expect(list.actionsFor([rows[0], rows[2]]).map((action) => action.id)).toEqual(['delete']);
		expect(list.actionsFor([rows[0], rows[1]]).map((action) => action.id)).toEqual([]);
	});

	it('acts on the selection from a row inside it, on the row alone from outside', () => {
		const list = model();
		list.toggle(rows[0]);
		list.toggle(rows[2]);
		expect(list.targets(rows[2])).toEqual([rows[0], rows[2]]);
		expect(list.targets(rows[1])).toEqual([rows[1]]);
	});

	it('runs an action by its key on the selection and clears it afterwards', async () => {
		const list = model();
		list.selectAll();
		list.toggle(rows[1]);
		expect(list.handle({ key: 'Delete' } as KeyboardEvent)).toBe(true);
		await Promise.resolve();
		expect(remove).toHaveBeenCalledWith([rows[0], rows[2]]);
		await vi.waitFor(() => expect(list.selected).toEqual([]));
	});

	it('moves with the arrows, extends with Shift and lists its keys for the overview', () => {
		const list = model();
		list.handle({ key: 'ArrowDown' } as KeyboardEvent);
		list.handle({ key: 'ArrowDown', shiftKey: true } as KeyboardEvent);
		expect(list.selected).toEqual([rows[0], rows[1]]);
		list.handle({ key: 'End' } as KeyboardEvent);
		expect(list.selected).toEqual([rows[2]]);
		expect(list.help().map((line) => line.label)).toContain('Delete');
	});
});
