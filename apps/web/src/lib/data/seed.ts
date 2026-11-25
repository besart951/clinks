import { streetLine } from '@clinks/domain/address';
import { addDays, atTime, toCalendarDate } from '@clinks/domain/dates';
import { newId, type ContactId, type FolderId, type RoleId, type TenantId } from '@clinks/domain/ids';
import { invoiceTotals } from '@clinks/domain/money';
import { administratorPermissions, userPermissions } from '@clinks/domain/permissions';
import type {
	Appointment,
	BaseRecord,
	Contact,
	Industry,
	Invoice,
	InvoiceLine,
	Permission,
	PhysioService,
	SpitexService,
	Task,
	TaskPriority,
	TaskStatus,
	Tenant,
	User,
} from '@clinks/domain/types';
import type { Snapshot, TableName, Tables } from './database.ts';

/** Same demo data on every reset, shifted so that "today" is always the current day. */
export function mulberry32(seed: number) {
	let state = seed;
	return function next() {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export const demoPassword = 'demo1234';

const firstNames = [
	'Anna',
	'Hans',
	'Elisabeth',
	'Peter',
	'Margrit',
	'Walter',
	'Rosa',
	'Kurt',
	'Heidi',
	'Bruno',
	'Verena',
	'Giuseppe',
	'Ursula',
	'Fritz',
	'Lea',
	'Noah',
	'Mia',
	'Luca',
	'Sophie',
	'Leon',
	'Elena',
	'David',
	'Laura',
	'Simon',
	'Nina',
];
const lastNames = [
	'Meier',
	'Brunner',
	'Zaugg',
	'Kunz',
	'Häfliger',
	'Imhof',
	'Bühler',
	'Lüthi',
	'Marti',
	'Steiner',
	'Jost',
	'Rossi',
	'Schär',
	'Fischer',
	'Huber',
	'Baumann',
	'Frei',
	'Gerber',
	'Widmer',
	'Graf',
	'Wyss',
	'Hofer',
	'Egli',
	'Suter',
	'Kaufmann',
];
const streets = [
	'Bahnhofstrasse',
	'Hauptstrasse',
	'Kirchenfeldstrasse',
	'Beundenweg',
	'Zentralstrasse',
	'Seevorstadt',
	'Mettlenweg',
	'Dufourstrasse',
	'Bözingenstrasse',
	'Schlossstrasse',
	'Dorfstrasse',
	'Bielstrasse',
	'Schulweg',
	'Bernstrasse',
	'Schützenweg',
];
const places: [string, string][] = [
	['2502', 'Biel/Bienne'],
	['3250', 'Lyss'],
	['2560', 'Nidau'],
	['3270', 'Aarberg'],
	['3252', 'Worben'],
	['2555', 'Brügg'],
	['3255', 'Rapperswil BE'],
	['3267', 'Seedorf BE'],
];
const insurers = ['Helsana', 'Visana', 'Concordia', 'Sanitas', 'CSS', 'SWICA'];

interface SeedContext {
	random: () => number;
	now: Date;
	today: string;
	snapshot: Snapshot;
}

function pick<T>(context: SeedContext, values: readonly T[]): T {
	return values[Math.floor(context.random() * values.length)];
}

function between(context: SeedContext, min: number, max: number): number {
	return min + Math.floor(context.random() * (max - min + 1));
}

function id<T extends string>(context: SeedContext): T {
	return newId<T>(
		context.now.getTime() - 86_400_000 * 30 + Math.floor(context.random() * 86_400_000 * 30),
		context.random,
	);
}

function add<Name extends TableName>(
	context: SeedContext,
	table: Name,
	row: Omit<Tables[Name], keyof BaseRecord> & { id?: Tables[Name]['id'] },
): Tables[Name] {
	const created = new Date(context.now.getTime() - between(context, 1, 60) * 86_400_000).toISOString();
	const record = { id: id(context), ...row, revision: 1, createdAt: created, updatedAt: created } as Tables[Name];
	(context.snapshot[table] as Tables[Name][]).push(record);
	return record;
}

function emptySnapshot(): Snapshot {
	return {
		tenants: [],
		users: [],
		roles: [],
		memberships: [],
		invitations: [],
		sessions: [],
		contacts: [],
		appointments: [],
		folders: [],
		documents: [],
		invoices: [],
		expenses: [],
		tasks: [],
		comments: [],
		mails: [],
		templates: [],
		campaigns: [],
		prescriptions: [],
		notes: [],
		timeEntries: [],
		weekReleases: [],
		notifications: [],
		audit: [],
		storageSettings: [],
	};
}

const avatarColors = ['#0f766e', '#7c3aed', '#c2410c', '#1d4ed8', '#be123c', '#4d7c0f', '#a16207', '#0e7490'];

function user(context: SeedContext, input: { first: string; last: string; email: string; superAdmin?: boolean }): User {
	return add(context, 'users', {
		email: input.email,
		firstName: input.first,
		lastName: input.last,
		avatarColor: pick(context, avatarColors),
		avatarDataUrl: null,
		password: demoPassword,
		emailVerified: true,
		twoFactorEnabled: false,
		locale: 'de-CH',
		globalRole: input.superAdmin ? 'super_administrator' : null,
		notificationPreferences: { inApp: true, email: true, push: false, digest: 'daily' },
	});
}

interface TenantSeed {
	name: string;
	industry: Industry;
	brandColor: string;
	city: [string, string];
	staff: { user: User; role: 'administrator' | 'user' | 'reception' | 'accounting'; title: string }[];
}

function tenant(context: SeedContext, seed: TenantSeed): { tenant: Tenant; roles: { [kind: string]: RoleId } } {
	const created = add(context, 'tenants', {
		name: seed.name,
		industry: seed.industry,
		brandColor: seed.brandColor,
		logoDataUrl: null,
		address: { street: 'Zentralplatz', houseNumber: '1', zip: seed.city[0], city: seed.city[1] },
		vatNumber: 'CHE-123.456.789 MWST',
		iban: 'CH93 0076 2011 6238 5295 7',
		locale: 'de-CH',
		timeZone: 'Europe/Zurich',
		plan: 'business',
		billingCycle: 'monthly',
		trialEndsAt: new Date(context.now.getTime() + 9 * 86_400_000).toISOString(),
		cancelledAt: null,
		enabledModules:
			seed.industry === 'physio' ? ['mail', 'finance', 'planner', 'physio'] : ['mail', 'finance', 'planner', 'spitex'],
		paymentMethod: { brand: 'Visa', last4: '4417', expires: '08/28' },
		featureFlags: ['command_palette'],
		onboardingCompleted: true,
	});
	const tenantId = created.id;
	const role = (name: string, kind: 'administrator' | 'user' | 'custom', permissions: readonly Permission[]) =>
		add(context, 'roles', { tenantId, name, kind, permissions: [...permissions] }).id;
	const roles = {
		administrator: role('Administrator', 'administrator', administratorPermissions),
		user: role('Benutzer', 'user', [
			...userPermissions,
			'contacts.write',
			'calendar.write',
			'documents.write',
			'planner.write',
			'physio.write',
			'spitex.write',
			'mail.write',
		]),
		reception: role('Empfang', 'custom', [
			'contacts.read',
			'contacts.write',
			'calendar.read',
			'calendar.write',
			'mail.read',
			'mail.write',
			'documents.read',
			'planner.read',
			'physio.read',
			'spitex.read',
		]),
		accounting: role('Buchhaltung', 'custom', [
			'contacts.read',
			'finance.read',
			'finance.write',
			'documents.read',
			'documents.write',
			'audit.read',
		]),
	};
	for (const member of seed.staff) {
		add(context, 'memberships', {
			tenantId,
			userId: member.user.id,
			roleId: roles[member.role],
			status: 'active',
			jobTitle: member.title,
		});
	}
	return { tenant: created, roles };
}

function person(context: SeedContext, tenantId: TenantId, tags: string[], extra: Partial<Contact> = {}): Contact {
	const [zip, city] = pick(context, places);
	const firstName = pick(context, firstNames);
	const lastName = pick(context, lastNames);
	const year = between(context, 1932, 1998);
	return add(context, 'contacts', {
		tenantId,
		kind: 'person',
		firstName,
		lastName,
		companyName: '',
		email:
			`${firstName}.${lastName}`
				.toLowerCase()
				.replace(/[äöü]/g, (letter) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[letter] ?? letter) + '@example.ch',
		phone: `+41 32 ${between(context, 300, 399)} ${between(context, 10, 99)} ${between(context, 10, 99)}`,
		address: { street: pick(context, streets), houseNumber: String(between(context, 1, 80)), zip, city },
		birthDate: `${year}-${String(between(context, 1, 12)).padStart(2, '0')}-${String(between(context, 1, 28)).padStart(2, '0')}`,
		insurer: pick(context, insurers),
		tags,
		notes: '',
		archived: false,
		...extra,
	});
}

function company(context: SeedContext, tenantId: TenantId, name: string, tags: string[]): Contact {
	const [zip, city] = pick(context, places);
	return add(context, 'contacts', {
		tenantId,
		kind: 'company',
		firstName: '',
		lastName: '',
		companyName: name,
		email: `info@${name.toLowerCase().replace(/[^a-z]+/g, '')}.ch`,
		phone: `+41 32 ${between(context, 300, 399)} ${between(context, 10, 99)} 00`,
		address: { street: pick(context, streets), houseNumber: String(between(context, 1, 80)), zip, city },
		birthDate: null,
		insurer: '',
		tags,
		notes: '',
		archived: false,
	});
}

function displayName(contact: Contact) {
	return contact.kind === 'company' ? contact.companyName : `${contact.firstName} ${contact.lastName}`;
}

function appointment(context: SeedContext, input: Omit<Appointment, keyof BaseRecord>) {
	return add(context, 'appointments', input);
}

function invoiceFor(
	context: SeedContext,
	tenantId: TenantId,
	contact: Contact,
	lines: InvoiceLine[],
	index: number,
	ageDays: number,
): Invoice {
	const issueDate = addDays(context.today, -ageDays);
	const dueDate = addDays(issueDate, 30);
	const gross = invoiceTotals({ lines, payments: [] }).gross;
	const roll = context.random();
	const status = ageDays < 3 && roll < 0.5 ? 'draft' : 'open';
	const paid = status === 'open' && (ageDays > 40 ? roll < 0.75 : roll < 0.4);
	const partially = status === 'open' && !paid && roll > 0.85;
	return add(context, 'invoices', {
		tenantId,
		number: `${context.now.getFullYear()}-${String(index).padStart(4, '0')}`,
		kind: 'invoice',
		contactId: contact.id,
		issueDate,
		dueDate,
		status,
		lines,
		payments: paid
			? [{ date: addDays(issueDate, between(context, 5, 28)), amount: gross }]
			: partially
				? [{ date: addDays(issueDate, 10), amount: Math.round(gross / 2 / 5) * 5 }]
				: [],
		reminderLevel: !paid && ageDays > 50 ? 1 : 0,
		notes: '',
		appointmentIds: [],
	});
}

const physioServicesByWeight: PhysioService[] = ['general', 'general', 'general', 'complex', 'home', 'initial'];
const spitexServicesByWeight: SpitexService[] = [
	'basic_care',
	'basic_care',
	'treatment_care',
	'treatment_care',
	'housekeeping',
	'assessment',
	'support',
];
const spitexDurations: { [service in SpitexService]: number } = {
	assessment: 60,
	treatment_care: 30,
	basic_care: 45,
	housekeeping: 90,
	support: 60,
};

function seedCalendar(context: SeedContext, tenantId: TenantId, industry: Industry, staff: User[], clients: Contact[]) {
	const workers = staff.slice(1);
	for (let offset = -14; offset <= 21; offset++) {
		const date = addDays(context.today, offset);
		const weekday = new Date(`${date}T12:00:00`).getDay();
		if (weekday === 0 || weekday === 6) continue;
		for (const worker of workers) {
			let minutes = 7 * 60 + 30 + between(context, 0, 3) * 15;
			const count = between(context, 3, 6);
			for (let index = 0; index < count; index++) {
				const client = pick(context, clients);
				const service =
					industry === 'physio' ? pick(context, physioServicesByWeight) : pick(context, spitexServicesByWeight);
				const duration =
					industry === 'physio' ? (service === 'initial' ? 45 : 30) : spitexDurations[service as SpitexService];
				const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
				const start = atTime(date, time);
				const end = new Date(new Date(start).getTime() + duration * 60_000).toISOString();
				const past = offset < 0 || (offset === 0 && minutes < context.now.getHours() * 60);
				const open = industry === 'spitex' && offset >= 0 && context.random() < 0.08;
				appointment(context, {
					tenantId,
					title: displayName(client),
					kind: industry === 'physio' ? 'physio' : 'spitex',
					status: past
						? context.random() < 0.05
							? 'cancelled'
							: 'done'
						: context.random() < 0.5
							? 'confirmed'
							: 'planned',
					contactId: client.id,
					assigneeId: open ? null : worker.id,
					start,
					end,
					location:
						industry === 'spitex' ? `${streetLine(client.address)}, ${client.address.city}` : 'Behandlungsraum 1',
					notes: '',
					seriesId: null,
					service,
					arrivalWindow:
						industry === 'spitex'
							? {
									from: time,
									to: `${String(Math.floor((minutes + 30) / 60)).padStart(2, '0')}:${String((minutes + 30) % 60).padStart(2, '0')}`,
								}
							: null,
					billedInvoiceId: null,
				});
				minutes += duration + between(context, 1, 4) * 15;
				if (minutes > 17 * 60) break;
			}
		}
		if (offset % 7 === 1) {
			appointment(context, {
				tenantId,
				title: 'Teamsitzung',
				kind: 'meeting',
				status: 'confirmed',
				contactId: null,
				assigneeId: staff[0].id,
				start: atTime(date, '12:15'),
				end: atTime(date, '13:00'),
				location: 'Sitzungszimmer',
				notes: 'Fallbesprechung und Wochenplanung',
				seriesId: null,
				service: null,
				arrivalWindow: null,
				billedInvoiceId: null,
			});
		}
	}
}

const taskTitles: [string, TaskStatus, TaskPriority, string[]][] = [
	['Jahresabschluss vorbereiten', 'todo', 'high', ['Finanzen']],
	['Neue Mitarbeiterin einarbeiten', 'in_progress', 'medium', ['Team']],
	['Hygienekonzept überarbeiten', 'backlog', 'medium', ['Qualität']],
	['Offene Verordnungen prüfen', 'todo', 'urgent', ['Administration']],
	['Website-Texte aktualisieren', 'backlog', 'low', ['Marketing']],
	['Ferienplanung Dezember', 'review', 'high', ['Team']],
	['Material bestellen', 'done', 'medium', ['Einkauf']],
	['Newsletter Winterprogramm', 'in_progress', 'medium', ['Marketing']],
	['Datenschutzerklärung prüfen lassen', 'todo', 'high', ['Administration']],
	['Kassensturz November', 'done', 'low', ['Finanzen']],
	['Fortbildung anmelden', 'backlog', 'low', ['Team']],
	['Rückrufe Krankenkassen', 'in_progress', 'urgent', ['Administration']],
	['Fahrzeug zum Service', 'todo', 'medium', ['Einkauf']],
	['Qualitätsbericht schreiben', 'review', 'medium', ['Qualität']],
];

function seedTasks(context: SeedContext, tenantId: TenantId, staff: User[], contacts: Contact[]): Task[] {
	return taskTitles.map(([title, status, priority, labels], index) =>
		add(context, 'tasks', {
			tenantId,
			title,
			description: 'Bitte bis zum Fälligkeitsdatum erledigen und im Team kurz rückmelden.',
			status,
			priority,
			assigneeIds: staff.length > 0 ? [pick(context, staff).id] : [],
			dueDate: addDays(context.today, between(context, -3, 20)),
			labels,
			order: index,
			contactId: index % 4 === 0 ? pick(context, contacts).id : null,
			checklist: [
				{ text: 'Unterlagen zusammenstellen', done: status === 'done' || context.random() < 0.5 },
				{ text: 'Mit Leitung abstimmen', done: status === 'done' },
			],
		}),
	);
}

function seedMail(context: SeedContext, tenantId: TenantId, tenantName: string, me: User, contacts: Contact[]) {
	const subjects = [
		'Terminanfrage',
		'Frage zur Rechnung',
		'Verschiebung nächste Woche',
		'Kostengutsprache',
		'Danke für die Behandlung',
		'Neue Adresse',
		'Rückruf erbeten',
		'Unterlagen Versicherung',
	];
	for (let index = 0; index < 16; index++) {
		const contact = contacts[index % contacts.length];
		const sentAt = new Date(
			context.now.getTime() - index * 5 * 3_600_000 - between(context, 0, 120) * 60_000,
		).toISOString();
		add(context, 'mails', {
			tenantId,
			folder: index < 12 ? 'inbox' : index < 14 ? 'sent' : 'archive',
			from: index < 12 ? contact.email : me.email,
			fromName: index < 12 ? displayName(contact) : `${me.firstName} ${me.lastName}`,
			to: index < 12 ? [me.email] : [contact.email],
			subject: subjects[index % subjects.length],
			body: `Guten Tag\n\nIch melde mich wegen ${subjects[index % subjects.length].toLowerCase()}. Können Sie mir bitte kurz Bescheid geben?\n\nFreundliche Grüsse\n${displayName(contact)}`,
			sentAt,
			read: index > 3,
			starred: index === 2,
			contactId: contact.id,
		});
	}
	add(context, 'mails', {
		tenantId,
		folder: 'drafts',
		from: me.email,
		fromName: `${me.firstName} ${me.lastName}`,
		to: [],
		subject: 'Infoabend Januar',
		body: 'Liebe Kundinnen und Kunden\n\n',
		sentAt: context.now.toISOString(),
		read: true,
		starred: false,
		contactId: null,
	});
	add(context, 'templates', {
		tenantId,
		name: 'Terminbestätigung',
		subject: 'Ihr Termin bei {firma}',
		body: 'Guten Tag {vorname} {nachname}\n\nWir bestätigen Ihren Termin. Bitte melden Sie sich bei Verhinderung 24 Stunden vorher.\n\nFreundliche Grüsse\n{firma}',
	});
	add(context, 'templates', {
		tenantId,
		name: 'Zahlungserinnerung',
		subject: 'Erinnerung: offene Rechnung',
		body: 'Guten Tag {vorname} {nachname}\n\nIn unserer Buchhaltung ist eine Rechnung noch offen. Falls Sie bereits bezahlt haben, betrachten Sie diese Nachricht als gegenstandslos.\n\nFreundliche Grüsse\n{firma}',
	});
	const campaigns: [string, 'draft' | 'review' | 'scheduled' | 'sent'][] = [
		['Winterprogramm', 'sent'],
		['Infoabend Januar', 'review'],
		['Neue Öffnungszeiten', 'scheduled'],
		['Rückenkurs Frühling', 'draft'],
	];
	for (const [name, status] of campaigns) {
		const recipients = status === 'sent' ? between(context, 180, 420) : 0;
		add(context, 'campaigns', {
			tenantId,
			name,
			subject: `${name} bei ${tenantName}`,
			previewText: 'Alles Wichtige auf einen Blick',
			body: `Guten Tag {vorname}\n\n${name}: Hier finden Sie alle Informationen.\n\nFreundliche Grüsse\n${tenantName}`,
			audienceTag: 'Newsletter',
			status,
			scheduledAt: status === 'scheduled' ? new Date(context.now.getTime() + 3 * 86_400_000).toISOString() : null,
			sentAt: status === 'sent' ? new Date(context.now.getTime() - 12 * 86_400_000).toISOString() : null,
			approvedBy: status === 'scheduled' || status === 'sent' ? me.id : null,
			stats: {
				recipients,
				opens: Math.round(recipients * 0.46),
				clicks: Math.round(recipients * 0.12),
				unsubscribes: Math.round(recipients * 0.01),
			},
		});
	}
}

const physioLines: { [service in PhysioService]: InvoiceLine } = {
	general: { description: 'Tarifposition 7301 · Allgemeine Physiotherapie', quantity: 1, unitPrice: 5328, vatRate: 0 },
	complex: { description: 'Tarifposition 7311 · Aufwändige Physiotherapie', quantity: 1, unitPrice: 8436, vatRate: 0 },
	home: { description: 'Tarifposition 7350 · Domizilbehandlung', quantity: 1, unitPrice: 3774, vatRate: 0 },
	initial: { description: 'Tarifposition 7301 · Erstbefund', quantity: 1, unitPrice: 5328, vatRate: 0 },
};

function seedFinance(context: SeedContext, tenantId: TenantId, industry: Industry, payers: Contact[]) {
	for (let index = 1; index <= 40; index++) {
		const payer = payers[index % payers.length];
		const lines: InvoiceLine[] =
			industry === 'physio'
				? [{ ...physioLines[pick(context, physioServicesByWeight)], quantity: between(context, 3, 9) }]
				: [
						{
							description: 'Pflegeleistungen KLV Art. 7 lit. b',
							quantity: between(context, 4, 20),
							unitPrice: 7680,
							vatRate: 0,
						},
						{ description: 'Hauswirtschaft', quantity: between(context, 2, 8), unitPrice: 4500, vatRate: 810 },
					];
		invoiceFor(context, tenantId, payer, lines, index, (40 - index) * 8 + between(context, 0, 3));
	}
	const expenses: [
		string,
		string,
		'material' | 'rent' | 'vehicle' | 'insurance' | 'it' | 'advertising' | 'travel' | 'other',
		number,
	][] = [
		['Miete Praxisräume', 'Immobilien Seeland AG', 'rent', 280000],
		['Therapiematerial', 'Medshop AG', 'material', 34850],
		['Softwareabo', 'CLinks', 'it', 11700],
		['Betriebshaftpflicht', 'Mobiliar', 'insurance', 98000],
		['Benzin', 'Coop Pronto', 'vehicle', 8640],
		['Inserat Bieler Tagblatt', 'Gassmann Media', 'advertising', 45000],
		['Zugbillett Fortbildung', 'SBB', 'travel', 6800],
		['Kaffee Wartezimmer', 'Migros', 'other', 2390],
	];
	for (let index = 0; index < 14; index++) {
		const [description, supplier, category, amount] = expenses[index % expenses.length];
		add(context, 'expenses', {
			tenantId,
			date: addDays(context.today, -index * 22 - between(context, 0, 3)),
			description,
			supplier,
			category,
			amount: amount + between(context, -10, 10) * 100,
			vatRate: category === 'insurance' ? 0 : 810,
			receiptId: null,
			status: index > 3 ? 'booked' : 'open',
		});
	}
}

function seedPhysio(context: SeedContext, tenantId: TenantId, staff: User[], patients: Contact[]) {
	const doctors = ['Dr. med. Ruth Keller', 'Dr. med. Thomas Gerber', 'Dr. med. Aylin Demir'];
	const diagnoses = [
		'Lumbalgie',
		'Status nach Knie-TEP rechts',
		'Schulterimpingement links',
		'Zervikalsyndrom',
		'Sprunggelenksdistorsion',
	];
	for (const patient of patients.slice(0, 18)) {
		const issuedOn = addDays(context.today, -between(context, 5, 60));
		add(context, 'prescriptions', {
			tenantId,
			contactId: patient.id,
			doctor: pick(context, doctors),
			diagnosis: pick(context, diagnoses),
			tariff: pick(context, ['7301', '7301', '7311', '7350'] as const),
			sessionsPrescribed: 9,
			issuedOn,
			validUntil: addDays(issuedOn, 70),
		});
		for (let session = 0; session < between(context, 1, 4); session++) {
			add(context, 'notes', {
				tenantId,
				kind: 'physio',
				contactId: patient.id,
				appointmentId: null,
				date: addDays(context.today, -session * 7 - between(context, 1, 4)),
				authorId: pick(context, staff.slice(1)).id,
				subjective: `Schmerz NRS ${between(context, 2, 6)}/10, Alltag ${context.random() < 0.5 ? 'besser' : 'unverändert'}.`,
				objective: `Beweglichkeit verbessert, Kraft M${between(context, 3, 5)}.`,
				assessment: 'Verlauf erfreulich, Belastbarkeit steigt.',
				plan: 'Heimprogramm weiterführen, nächste Sitzung Kräftigung.',
			});
		}
	}
}

function seedSpitex(context: SeedContext, tenantId: TenantId, staff: User[], clients: Contact[]) {
	for (const client of clients.slice(0, 14)) {
		add(context, 'notes', {
			tenantId,
			kind: 'spitex',
			contactId: client.id,
			appointmentId: null,
			date: addDays(context.today, -between(context, 0, 6)),
			authorId: pick(context, staff.slice(1)).id,
			subjective: 'Fühlt sich wohl, hat gut geschlafen.',
			objective: `Blutdruck ${between(context, 115, 150)}/${between(context, 70, 95)}, Gewicht stabil.`,
			assessment: 'Allgemeinzustand stabil.',
			plan: 'Einsätze wie geplant weiterführen.',
		});
	}
	for (let offset = -7; offset < 0; offset++) {
		for (const worker of staff.slice(1)) {
			add(context, 'timeEntries', {
				tenantId,
				userId: worker.id,
				appointmentId: null,
				date: addDays(context.today, offset),
				minutes: between(context, 300, 510),
				description: 'Einsätze und Wegzeit',
			});
		}
	}
}

function seedDocuments(context: SeedContext, tenantId: TenantId, me: User, contacts: Contact[]) {
	const folder = (name: string, parentId: FolderId | null = null) =>
		add(context, 'folders', { tenantId, name, parentId }).id;
	const contracts = folder('Verträge');
	const forms = folder('Formulare');
	folder('Belege');
	const file = (name: string, folderId: FolderId | null, text: string, contactId?: ContactId) =>
		add(context, 'documents', {
			tenantId,
			name,
			folderId,
			mimeType: 'text/plain',
			size: text.length,
			dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
			targets: contactId ? [{ kind: 'contact', id: contactId }] : [],
			uploadedBy: me.id,
		});
	file(
		'Mietvertrag Praxis.txt',
		contracts,
		'Mietvertrag zwischen Immobilien Seeland AG und der Praxis. Laufzeit bis 2029.',
	);
	file('Anmeldeformular.txt', forms, 'Name, Vorname, Geburtsdatum, Versicherung, Hausarzt');
	file('Kostengutsprache.txt', null, 'Kostengutsprache der Versicherung für 9 Sitzungen.', contacts[0].id);
}

function seedActivity(context: SeedContext, tenantId: TenantId, staff: User[], contacts: Contact[], tasks: Task[]) {
	const actions: [string, 'contact' | 'task' | 'invoice' | 'appointment', string][] = [
		['contact.created', 'contact', displayName(contacts[0])],
		['task.updated', 'task', tasks[1].title],
		['appointment.updated', 'appointment', displayName(contacts[2])],
		['invoice.created', 'invoice', `${context.now.getFullYear()}-0024`],
		['contact.updated', 'contact', displayName(contacts[3])],
		['task.created', 'task', tasks[3].title],
	];
	actions.forEach(([action, kind, label], index) => {
		const row = add(context, 'audit', {
			tenantId,
			actorId: staff[index % staff.length].id,
			action,
			target: { kind, id: contacts[index].id, label },
		});
		row.createdAt = new Date(context.now.getTime() - (index + 1) * 2.5 * 3_600_000).toISOString();
	});
	const me = staff[0];
	const notify = (
		message: string,
		params: { [name: string]: string },
		href: string,
		kind: 'mention' | 'assignment' | 'invoice' | 'appointment' | 'system',
		read: boolean,
	) => add(context, 'notifications', { tenantId, userId: me.id, kind, message: { key: message, params }, href, read });
	notify(
		'ui.ws.notification.mentioned',
		{ name: `${staff[1].firstName} ${staff[1].lastName}`, target: tasks[1].title },
		`/planner/${tasks[1].id}`,
		'mention',
		false,
	);
	notify('ui.ws.notification.assigned', { target: tasks[3].title }, `/planner/${tasks[3].id}`, 'assignment', false);
	notify(
		'ui.ws.notification.invoice_overdue',
		{ number: `${context.now.getFullYear()}-0003` },
		'/finance',
		'invoice',
		false,
	);
	notify('ui.ws.notification.trial_ending', { days: '9' }, '/settings/billing', 'system', true);
}

function staffSeed(
	context: SeedContext,
	people: [string, string, string, TenantSeed['staff'][number]['role'], string][],
) {
	return people.map(([first, last, email, role, title]) => ({
		user: user(context, { first, last, email }),
		role,
		title,
	}));
}

/** Builds the full demo data set for two tenants and one platform super administrator. */
export function createSeed(now: Date = new Date(), seed = 20261121): Snapshot {
	const context: SeedContext = { random: mulberry32(seed), now, today: toCalendarDate(now), snapshot: emptySnapshot() };
	user(context, { first: 'Plattform', last: 'Admin', email: 'admin@clinks.ch', superAdmin: true });
	const besi = user(context, { first: 'Besi', last: 'Morina', email: 'besi@stille.ch' });

	const physioStaff = [
		{ user: besi, role: 'administrator' as const, title: 'Praxisleitung' },
		...staffSeed(context, [
			['Sandra', 'Roth', 'sandra.roth@stille.ch', 'user', 'Physiotherapeutin'],
			['Marco', 'Bianchi', 'marco.bianchi@stille.ch', 'user', 'Physiotherapeut'],
			['Nicole', 'Weber', 'nicole.weber@stille.ch', 'reception', 'Empfang'],
			['Jonas', 'Keller', 'jonas.keller@stille.ch', 'accounting', 'Buchhaltung'],
		]),
	];
	const physio = tenant(context, {
		name: 'Stille Physio',
		industry: 'physio',
		brandColor: '#0f766e',
		city: ['2502', 'Biel/Bienne'],
		staff: physioStaff,
	});
	const physioId = physio.tenant.id;
	const patients = Array.from({ length: 34 }, () => person(context, physioId, ['Patient:in']));
	const physioCompanies = ['Helsana', 'Visana', 'Suva', 'Hausarztpraxis Seeland'].map((name) =>
		company(context, physioId, name, ['Kostenträger']),
	);
	for (const patient of patients.slice(0, 20)) patient.tags.push('Newsletter');
	const physioTherapists = physioStaff.filter((member) => member.role === 'user').map((member) => member.user);
	seedCalendar(context, physioId, 'physio', [besi, ...physioTherapists], patients);
	seedFinance(context, physioId, 'physio', [...patients.slice(0, 14), ...physioCompanies]);
	seedPhysio(context, physioId, [besi, ...physioTherapists], patients);
	const physioTasks = seedTasks(
		context,
		physioId,
		physioStaff.map((member) => member.user),
		patients,
	);
	seedMail(context, physioId, 'Stille Physio', besi, patients);
	seedDocuments(context, physioId, besi, patients);
	seedActivity(
		context,
		physioId,
		physioStaff.map((member) => member.user),
		patients,
		physioTasks,
	);
	add(context, 'invitations', {
		tenantId: physioId,
		email: 'lea.graf@stille.ch',
		roleId: physio.roles.user,
		status: 'pending',
		expiresAt: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
		invitedBy: besi.id,
	});

	const spitexStaff = [
		{ user: besi, role: 'administrator' as const, title: 'Betriebsleitung' },
		...staffSeed(context, [
			['Fatma', 'Yilmaz', 'fatma.yilmaz@spitex-seeland.ch', 'user', 'Pflegefachfrau HF'],
			['Daniel', 'Moser', 'daniel.moser@spitex-seeland.ch', 'user', 'Fachmann Gesundheit EFZ'],
			['Ruth', 'Gerber', 'ruth.gerber@spitex-seeland.ch', 'user', 'Pflegehelferin SRK'],
			['Luca', 'Meier', 'luca.meier@spitex-seeland.ch', 'user', 'Haushelfer'],
		]),
	];
	const spitex = tenant(context, {
		name: 'Stille Spitex Seeland',
		industry: 'spitex',
		brandColor: '#7c3aed',
		city: ['3250', 'Lyss'],
		staff: spitexStaff,
	});
	const spitexId = spitex.tenant.id;
	const clients = Array.from({ length: 26 }, () =>
		person(context, spitexId, ['Klient:in'], {
			birthDate: `19${between(context, 28, 50)}-0${between(context, 1, 9)}-1${between(context, 0, 9)}`,
		}),
	);
	clients[0].notes = 'Schlüsselbox beim Hauseingang, Code bei der Leitung';
	clients[1].notes = 'Möchte nicht vor 08:15 geweckt werden';
	const spitexWorkers = spitexStaff.slice(1).map((member) => member.user);
	seedCalendar(context, spitexId, 'spitex', [besi, ...spitexWorkers], clients);
	seedFinance(context, spitexId, 'spitex', clients.slice(0, 16));
	seedSpitex(context, spitexId, [besi, ...spitexWorkers], clients);
	const spitexTasks = seedTasks(
		context,
		spitexId,
		spitexStaff.map((member) => member.user),
		clients,
	);
	seedMail(context, spitexId, 'Stille Spitex Seeland', besi, clients);
	seedDocuments(context, spitexId, besi, clients);
	seedActivity(
		context,
		spitexId,
		spitexStaff.map((member) => member.user),
		clients,
		spitexTasks,
	);

	add(context, 'sessions', {
		userId: besi.id,
		device: 'Chrome auf macOS',
		location: 'Biel/Bienne',
		lastActiveAt: now.toISOString(),
	});
	add(context, 'sessions', {
		userId: besi.id,
		device: 'Safari auf iPhone',
		location: 'Lyss',
		lastActiveAt: new Date(now.getTime() - 26 * 3_600_000).toISOString(),
	});
	return context.snapshot;
}

/** A small starter set for a tenant created in onboarding with "add demo data". */
export function demoRowsFor(tenantId: TenantId, now: Date = new Date()): Partial<Snapshot> {
	const context: SeedContext = { random: mulberry32(7), now, today: toCalendarDate(now), snapshot: emptySnapshot() };
	const contacts = Array.from({ length: 8 }, () => person(context, tenantId, ['Demo']));
	seedTasks(context, tenantId, [], contacts);
	for (let index = 0; index < 5; index++) {
		const date = addDays(context.today, index + 1);
		appointment(context, {
			tenantId,
			title: `Erstgespräch ${displayName(contacts[index])}`,
			kind: 'meeting',
			status: 'planned',
			contactId: contacts[index].id,
			assigneeId: null,
			start: atTime(date, '09:00'),
			end: atTime(date, '10:00'),
			location: '',
			notes: '',
			seriesId: null,
			service: null,
			arrivalWindow: null,
			billedInvoiceId: null,
		});
	}
	return {
		contacts: context.snapshot.contacts,
		tasks: context.snapshot.tasks,
		appointments: context.snapshot.appointments,
	};
}
