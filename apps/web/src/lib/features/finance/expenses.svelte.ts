import { toast } from 'svelte-sonner';
import { today } from '@clinks/domain/dates';
import type { Expense, ExpenseCategory, VatRate } from '@clinks/domain/types';
import type { Draft } from '@clinks/contracts/repository';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { uploadDocument } from '../collaboration/attachments.svelte.ts';

function emptyExpense(): Draft<Expense> {
	return {
		date: today(),
		description: '',
		supplier: '',
		category: 'material',
		amount: 0,
		vatRate: 810,
		receiptId: null,
		status: 'open',
	};
}

/** Expenses with receipts: capture, edit, book. */
export class ExpensesModel {
	readonly resource: Resource<Expense[]>;
	status = $state<'' | 'open' | 'booked'>('');
	category = $state<ExpenseCategory | ''>('');
	editing = $state.raw<Expense | null>(null);
	value = $state<Draft<Expense>>(emptyExpense());
	amountInput = $state('');
	receipt = $state<File | null>(null);
	fields = $state<{ [field: string]: string }>({});
	busy = $state(false);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['expenses', 'documents'], async () =>
			(await workspace.api.expenses.list()).sort((left, right) => right.date.localeCompare(left.date)),
		);
	}

	get rows(): Expense[] {
		return (this.resource.data ?? []).filter(
			(expense) =>
				(!this.status || expense.status === this.status) && (!this.category || expense.category === this.category),
		);
	}

	get total() {
		return this.rows.reduce((sum, expense) => sum + expense.amount, 0);
	}

	start(expense: Expense | null) {
		this.editing = expense;
		this.value = expense ? structuredClone($state.snapshot(expense)) : emptyExpense();
		this.amountInput = expense ? (expense.amount / 100).toFixed(2) : '';
		this.receipt = null;
		this.fields = {};
	}

	setVat(rate: string) {
		this.value.vatRate = Number(rate) as VatRate;
	}

	async save(): Promise<boolean> {
		this.busy = true;
		this.fields = {};
		const api = this.#workspace.api;
		try {
			const draft = {
				...$state.snapshot(this.value),
				amount: Math.round(Number(this.amountInput.replace(',', '.')) * 100) || 0,
			} as Draft<Expense>;
			if (this.receipt) draft.receiptId = (await uploadDocument(this.#workspace, this.receipt, {})).id;
			const saved = this.editing
				? await api.expenses.update(this.editing.id, this.editing.revision, draft)
				: await api.expenses.create(draft);
			if (this.receipt && draft.receiptId) {
				const document = await api.documents.get(draft.receiptId);
				await api.documents.update(document.id, document.revision, { targets: [{ kind: 'expense', id: saved.id }] });
			}
			toast.success(this.#workspace.t('ui.ws.expense.saved'));
			return true;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
			return false;
		} finally {
			this.busy = false;
		}
	}

	async book(expense: Expense) {
		await this.#workspace.run(
			() => this.#workspace.api.expenses.update(expense.id, expense.revision, { status: 'booked' }),
			{ success: 'ui.ws.expense.booked' },
		);
	}

	async remove(expense: Expense) {
		const api = this.#workspace.api.expenses;
		await this.#workspace.run(() => api.remove(expense.id), {
			success: 'ui.ws.expense.deleted',
			undo: () => api.restore(expense),
		});
	}

	async receiptUrl(expense: Expense): Promise<string | null> {
		if (!expense.receiptId) return null;
		const document = await this.#workspace.api.documents.get(expense.receiptId).catch(() => null);
		return document?.dataUrl ?? null;
	}
}
