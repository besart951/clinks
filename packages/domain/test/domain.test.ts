import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { addDays, atTime, isoWeek, isoWeekday, monthGrid, startOfWeek } from '../src/dates.ts';
import { newId, type AppointmentId, type UserId } from '../src/ids.ts';
import { layoutDay } from '../src/layout.ts';
import { effectiveStatus, invoiceTotals, nextInvoiceNumber, roundToFiveRappen, vatFromGross } from '../src/money.ts';
import { moduleBooked, roleGrants } from '../src/permissions.ts';
import { planFor, priceFor } from '../src/plans.ts';
import {
	creditorReference,
	formatReference,
	isQrIban,
	isValidReference,
	isValidSwissIban,
	modulo10,
	paymentDetails,
	qrBillPayload,
	qrReference,
} from '../src/qr-bill.ts';
import { formatAddress, splitStreet, streetLine } from '../src/address.ts';
import { conflictsFor, planAssignments, seriesSlots, withinArrivalWindow } from '../src/scheduling.ts';
import type { Appointment, Invoice } from '../src/types.ts';

function appointment(overrides: Partial<Appointment>): Appointment {
	return {
		id: newId<AppointmentId>(),
		tenantId: 't' as Appointment['tenantId'],
		revision: 1,
		createdAt: '',
		updatedAt: '',
		title: 'Visit',
		kind: 'spitex',
		status: 'planned',
		contactId: null,
		assigneeId: null,
		start: atTime('2026-11-23', '08:00'),
		end: atTime('2026-11-23', '08:30'),
		location: '',
		notes: '',
		seriesId: null,
		service: null,
		arrivalWindow: null,
		billedInvoiceId: null,
		...overrides,
	};
}

describe('money', () => {
	it('sums VAT per rate and rounds the total to five Rappen', () => {
		const totals = invoiceTotals({
			lines: [
				{ description: 'A', quantity: 2, unitPrice: 1000, vatRate: 810 },
				{ description: 'B', quantity: 1, unitPrice: 333, vatRate: 260 },
			],
			payments: [{ date: '2026-01-01', amount: 1000 }],
		});
		assert.equal(totals.net, 2333);
		assert.deepEqual(
			totals.shares.map((share) => [share.rate, share.vat]),
			[
				[810, 162],
				[260, 9],
			],
		);
		assert.equal(totals.gross, roundToFiveRappen(2333 + 162 + 9));
		assert.equal(totals.balance, totals.gross - 1000);
	});

	it('derives overdue, reminded and paid from payments and due date', () => {
		const invoice = {
			status: 'open',
			dueDate: '2026-01-31',
			reminderLevel: 0,
			lines: [{ description: 'A', quantity: 1, unitPrice: 10000, vatRate: 0 }],
			payments: [],
		} as unknown as Invoice;
		assert.equal(effectiveStatus(invoice, '2026-01-15'), 'open');
		assert.equal(effectiveStatus(invoice, '2026-02-02'), 'overdue');
		assert.equal(effectiveStatus({ ...invoice, reminderLevel: 1 }, '2026-02-02'), 'reminded');
		assert.equal(
			effectiveStatus({ ...invoice, payments: [{ date: '2026-01-20', amount: 4000 }] }, '2026-01-21'),
			'partially_paid',
		);
		assert.equal(
			effectiveStatus({ ...invoice, payments: [{ date: '2026-01-20', amount: 10000 }] }, '2026-03-01'),
			'paid',
		);
		assert.equal(effectiveStatus({ ...invoice, status: 'draft' }, '2026-03-01'), 'draft');
	});

	it('numbers invoices per year', () => {
		assert.equal(nextInvoiceNumber([{ number: '2026-0007' }, { number: '2025-0099' }], 2026), '2026-0008');
		assert.equal(nextInvoiceNumber([], 2027), '2027-0001');
	});

	it('extracts input VAT from a gross amount', () => {
		assert.equal(vatFromGross(10810, 810), 810);
	});
});

describe('qr bill', () => {
	it('validates the IBAN checksum', () => {
		assert.equal(isValidSwissIban('CH93 0076 2011 6238 5295 7'), true);
		assert.equal(isValidSwissIban('CH94 0076 2011 6238 5295 7'), false);
		assert.equal(isValidSwissIban('DE89 3704 0044 0532 0130 00'), false);
	});

	it('builds an SPC 0200 payload with amount and message', () => {
		const payload = qrBillPayload({
			iban: 'CH93 0076 2011 6238 5295 7',
			creditor: {
				name: 'Stille Physio',
				address: { street: 'Zentralplatz', houseNumber: '1', zip: '2502', city: 'Biel/Bienne' },
			},
			debtor: null,
			amount: 21310,
			reference: null,
			message: 'Rechnung 2026-0001',
		}).split('\n');
		assert.equal(payload[0], 'SPC');
		assert.equal(payload[3], 'CH9300762011623852957');
		// Structured address: street and building number in their own lines.
		assert.deepEqual(payload.slice(4, 11), ['S', 'Stille Physio', 'Zentralplatz', '1', '2502', 'Biel/Bienne', 'CH']);
		assert.ok(payload.includes('213.10'));
		assert.equal(payload.at(-2), 'Rechnung 2026-0001');
		assert.equal(payload.at(-1), 'EPD');
		assert.equal(payload.at(-4), 'NON');
	});

	it('computes QR references and creditor references like the published examples', () => {
		// SIX implementation guide: 21 00000 00003 13947 14300 09017.
		assert.equal(modulo10('21000000000313947143000901'), 7);
		assert.equal(isValidReference('210000000003139471430009017'), true);
		assert.equal(isValidReference('210000000003139471430009018'), false);
		// ISO 11649 example.
		assert.equal(creditorReference('539007547034'), 'RF18539007547034');
		assert.equal(isValidReference('RF18 5390 0754 7034'), true);
		assert.equal(isValidReference('RF19539007547034'), false);
		const qr = qrReference('2026-0042');
		assert.equal(qr.length, 27);
		assert.equal(isValidReference(qr), true);
		assert.equal(formatReference({ type: 'QRR', value: qr }), '00 00000 00000 00000 02026 0042' + qr.at(-1));
		assert.equal(isValidReference(creditorReference('2026-0042')), true);
	});

	it('uses the QR reference with a QR-IBAN and the creditor reference with a normal IBAN', () => {
		assert.equal(isQrIban('CH44 3199 9123 0008 8901 2'), true);
		assert.equal(isQrIban('CH93 0076 2011 6238 5295 7'), false);
		const qr = paymentDetails(
			{ iban: 'CH93 0076 2011 6238 5295 7', qrIban: 'CH44 3199 9123 0008 8901 2' },
			'2026-0042',
		);
		assert.equal(qr?.iban, 'CH44 3199 9123 0008 8901 2');
		assert.equal(qr?.reference?.type, 'QRR');
		const scor = paymentDetails({ iban: 'CH93 0076 2011 6238 5295 7', qrIban: '' }, '2026-0042');
		assert.deepEqual(scor?.reference, { type: 'SCOR', value: creditorReference('2026-0042') });
		// A QR-IBAN in the IBAN field cannot be paid without a QR reference.
		assert.equal(paymentDetails({ iban: 'CH44 3199 9123 0008 8901 2', qrIban: '' }, '2026-0042'), null);
		const payload = qrBillPayload({
			iban: qr!.iban,
			creditor: { name: 'X', address: { street: 'A', houseNumber: '1', zip: '2502', city: 'Biel' } },
			debtor: null,
			amount: 100,
			reference: qr!.reference,
			message: '',
		}).split('\n');
		assert.equal(payload[3], 'CH4431999123000889012');
		assert.deepEqual(payload.slice(-4, -2), ['QRR', qr!.reference!.value]);
	});
});

describe('iso weeks', () => {
	it('numbers weeks from the one with the first Thursday', () => {
		assert.equal(isoWeek('2026-11-25'), 48);
		assert.equal(isoWeek('2026-01-01'), 1);
		assert.equal(isoWeek('2027-01-01'), 53);
		assert.equal(isoWeek('2024-12-30'), 1);
	});
});

describe('addresses', () => {
	it('splits a house number off the street', () => {
		assert.deepEqual(splitStreet('Bahnhofstrasse 57'), { street: 'Bahnhofstrasse', houseNumber: '57' });
		assert.deepEqual(splitStreet('Rue du 1er Mars 12 b'), { street: 'Rue du 1er Mars', houseNumber: '12b' });
		assert.deepEqual(splitStreet('Weg 3-5'), { street: 'Weg', houseNumber: '3-5' });
		assert.deepEqual(splitStreet('Postfach'), { street: 'Postfach', houseNumber: '' });
	});

	it('formats addresses, also older ones without a house number', () => {
		const address = { street: 'Kramgasse', houseNumber: '41', zip: '3011', city: 'Bern' };
		assert.equal(formatAddress(address), 'Kramgasse 41, 3011 Bern');
		assert.equal(
			streetLine({ ...address, street: 'Kramgasse 41', houseNumber: undefined as unknown as string }),
			'Kramgasse 41',
		);
		assert.equal(formatAddress({ ...address, street: '', houseNumber: '' }), '3011 Bern');
	});
});

describe('scheduling', () => {
	const anna = 'anna' as UserId;
	const beat = 'beat' as UserId;

	it('finds conflicts for the same person only', () => {
		const existing = appointment({ assigneeId: anna });
		const candidate = appointment({
			assigneeId: anna,
			start: atTime('2026-11-23', '08:15'),
			end: atTime('2026-11-23', '08:45'),
		});
		assert.equal(conflictsFor(candidate, [existing]).length, 1);
		assert.equal(conflictsFor({ ...candidate, assigneeId: beat }, [existing]).length, 0);
		assert.equal(conflictsFor(candidate, [{ ...existing, status: 'cancelled' }]).length, 0);
	});

	it('checks arrival windows', () => {
		assert.equal(withinArrivalWindow(atTime('2026-11-23', '08:10'), { from: '08:00', to: '08:30' }), true);
		assert.equal(withinArrivalWindow(atTime('2026-11-23', '09:00'), { from: '08:00', to: '08:30' }), false);
		assert.equal(withinArrivalWindow(atTime('2026-11-23', '09:00'), null), true);
	});

	it('creates series slots on the chosen weekdays', () => {
		const slots = seriesSlots({
			firstDate: '2026-11-23',
			time: '08:00',
			durationMinutes: 30,
			weekdays: [1, 4],
			count: 4,
		});
		assert.deepEqual(
			slots.map((slot) => new Date(slot.start).getDay()),
			[1, 4, 1, 4],
		);
		assert.equal(isoWeekday(addDays('2026-11-23', 3)), 4);
	});

	it('assigns open visits inside their window and balances load', () => {
		const open = [
			appointment({ arrivalWindow: { from: '08:00', to: '08:30' } }),
			appointment({ arrivalWindow: { from: '08:00', to: '08:30' } }),
		];
		const plan = planAssignments(open, [], [anna, beat], '2026-11-23');
		assert.equal(plan.length, 2);
		assert.notEqual(plan[0].assigneeId, plan[1].assigneeId);
	});

	it('leaves a visit open when nobody is free in the window', () => {
		const busy = appointment({
			assigneeId: anna,
			start: atTime('2026-11-23', '07:30'),
			end: atTime('2026-11-23', '09:30'),
		});
		const plan = planAssignments(
			[appointment({ arrivalWindow: { from: '08:00', to: '08:30' } })],
			[busy],
			[anna],
			'2026-11-23',
		);
		assert.equal(plan.length, 0);
	});

	it('lays overlapping appointments side by side', () => {
		const items = layoutDay(
			[
				appointment({}),
				appointment({ start: atTime('2026-11-23', '08:15'), end: atTime('2026-11-23', '09:00') }),
				appointment({ start: atTime('2026-11-23', '10:00'), end: atTime('2026-11-23', '10:30') }),
			],
			7 * 60,
			20 * 60,
		);
		assert.deepEqual(
			items.map((item) => [item.lane, item.lanes]),
			[
				[0, 2],
				[1, 2],
				[0, 1],
			],
		);
	});
});

describe('dates, plans and permissions', () => {
	it('starts weeks on Monday and shows six weeks per month', () => {
		assert.equal(startOfWeek('2026-11-22'), '2026-11-16');
		assert.equal(monthGrid('2026-11-10').length, 42);
		assert.equal(monthGrid('2026-11-10')[0], '2026-10-26');
	});

	it('prices plans per seat with two free months per year', () => {
		const team = planFor('team');
		assert.equal(priceFor(team, 3, 'monthly'), 11700);
		assert.equal(priceFor(team, 3, 'yearly'), 117000);
	});

	it('grants administrators everything and others only their permissions', () => {
		assert.equal(roleGrants({ kind: 'administrator', permissions: [] }, 'billing.manage'), true);
		assert.equal(roleGrants({ kind: 'custom', permissions: ['finance.read'] }, 'finance.write'), false);
		assert.equal(roleGrants(null, 'contacts.read'), false);
	});

	it('books modules only when the plan includes and the tenant enables them', () => {
		assert.equal(moduleBooked({ plan: 'starter', enabledModules: ['finance'] }, 'finance'), false);
		assert.equal(moduleBooked({ plan: 'team', enabledModules: ['finance'] }, 'finance'), true);
		assert.equal(moduleBooked({ plan: 'starter', enabledModules: [] }, 'contacts'), true);
	});
});
