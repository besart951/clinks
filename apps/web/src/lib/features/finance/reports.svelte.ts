import { addMonths, daysBetween, startOfMonth, today } from '@clinks/domain/dates';
import { effectiveStatus, invoiceTotals, vatFromGross } from '@clinks/domain/money';
import type { Expense, ExpenseCategory, Invoice, Rappen, VatRate } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface MonthFigures {
	month: string;
	revenue: Rappen;
	expenses: Rappen;
}

export interface FinanceReport {
	months: MonthFigures[];
	yearRevenue: Rappen;
	yearExpenses: Rappen;
	aging: { bucket: 'current' | 'month' | 'two_months' | 'older'; amount: Rappen; count: number }[];
	quarter: { label: string; output: { rate: VatRate; vat: Rappen }[]; input: Rappen; payable: Rappen };
	categories: { category: ExpenseCategory; amount: Rappen }[];
}

/** Pure calculation of the finance report, so it can be tested without the UI. */
export function buildReport(invoices: Invoice[], expenses: Expense[], on: string = today()): FinanceReport {
	const first = addMonths(startOfMonth(on), -11);
	const months: MonthFigures[] = Array.from({ length: 12 }, (_, index) => ({
		month: addMonths(first, index).slice(0, 7),
		revenue: 0,
		expenses: 0,
	}));
	for (const invoice of invoices) {
		for (const payment of invoice.payments) {
			const month = months.find((entry) => entry.month === payment.date.slice(0, 7));
			if (month) month.revenue += payment.amount;
		}
	}
	for (const expense of expenses) {
		const month = months.find((entry) => entry.month === expense.date.slice(0, 7));
		if (month) month.expenses += expense.amount;
	}
	const year = on.slice(0, 4);
	const aging: FinanceReport['aging'] = [
		{ bucket: 'current', amount: 0, count: 0 },
		{ bucket: 'month', amount: 0, count: 0 },
		{ bucket: 'two_months', amount: 0, count: 0 },
		{ bucket: 'older', amount: 0, count: 0 },
	];
	for (const invoice of invoices) {
		const status = effectiveStatus(invoice, on);
		if (!['open', 'partially_paid', 'overdue', 'reminded'].includes(status)) continue;
		const late = daysBetween(invoice.dueDate, on);
		const bucket = aging[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3];
		bucket.amount += invoiceTotals(invoice).balance;
		bucket.count += 1;
	}
	const quarterStartMonth = Math.floor((Number(on.slice(5, 7)) - 1) / 3) * 3 + 1;
	const quarterStart = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
	const quarterEnd = addMonths(quarterStart, 3);
	const inQuarter = (date: string) => date >= quarterStart && date < quarterEnd;
	const output = new Map<VatRate, Rappen>();
	for (const invoice of invoices.filter(
		(row) => row.status !== 'draft' && row.status !== 'cancelled' && inQuarter(row.issueDate),
	)) {
		for (const share of invoiceTotals(invoice).shares)
			if (share.rate > 0) output.set(share.rate, (output.get(share.rate) ?? 0) + share.vat);
	}
	const input = expenses
		.filter((expense) => inQuarter(expense.date))
		.reduce((sum, expense) => sum + vatFromGross(expense.amount, expense.vatRate), 0);
	const outputTotal = [...output.values()].reduce((sum, value) => sum + value, 0);
	const categories = new Map<ExpenseCategory, Rappen>();
	for (const expense of expenses.filter((row) => row.date.startsWith(year)))
		categories.set(expense.category, (categories.get(expense.category) ?? 0) + expense.amount);
	return {
		months,
		yearRevenue: months.filter((entry) => entry.month.startsWith(year)).reduce((sum, entry) => sum + entry.revenue, 0),
		yearExpenses: months
			.filter((entry) => entry.month.startsWith(year))
			.reduce((sum, entry) => sum + entry.expenses, 0),
		aging,
		quarter: {
			label: `Q${(quarterStartMonth + 2) / 3} ${year}`,
			output: [...output.entries()].map(([rate, vat]) => ({ rate, vat })),
			input,
			payable: outputTotal - input,
		},
		categories: [...categories.entries()]
			.map(([category, amount]) => ({ category, amount }))
			.sort((left, right) => right.amount - left.amount),
	};
}

export class ReportsModel {
	readonly resource: Resource<FinanceReport>;

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['invoices', 'expenses'], async () => {
			const [invoices, expenses] = await Promise.all([workspace.api.invoices.list(), workspace.api.expenses.list()]);
			return buildReport(invoices, expenses);
		});
	}
}
