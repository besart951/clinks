import type { DeliveryMethod, InvoiceSettings } from './invoicing.ts';
import type {
	AppointmentId,
	AuditEntryId,
	CampaignId,
	CommentId,
	ContactId,
	DocumentId,
	ExpenseId,
	FolderId,
	InvitationId,
	InvoiceId,
	InvoiceSendId,
	MailId,
	MembershipId,
	NoteId,
	NotificationId,
	PrescriptionId,
	RoleId,
	SeriesId,
	SessionId,
	TaskId,
	TemplateId,
	TenantId,
	TimeEntryId,
	WeekReleaseId,
	UserId,
} from './ids.ts';

/** An ISO-8601 timestamp such as 2026-11-21T08:30:00.000Z. */
export type Timestamp = string;
/** A calendar date such as 2026-11-21. */
export type CalendarDate = string;
/** Money in Swiss Rappen, so 1 CHF = 100. */
export type Rappen = number;

export interface BaseRecord<Key extends string = string> {
	id: Key;
	revision: number;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface TenantRecord<Key extends string = string> extends BaseRecord<Key> {
	tenantId: TenantId;
}

export const moduleKeys = [
	'contacts',
	'calendar',
	'documents',
	'mail',
	'finance',
	'planner',
	'physio',
	'spitex',
] as const;
export type ModuleKey = (typeof moduleKeys)[number];
export const coreModules: readonly ModuleKey[] = ['contacts', 'calendar', 'documents'];

export const planCodes = ['starter', 'team', 'business'] as const;
export type PlanCode = (typeof planCodes)[number];

export const industries = ['physio', 'spitex', 'services'] as const;
export type Industry = (typeof industries)[number];

export interface Address {
	street: string;
	/** Kept apart from the street, as the QR bill's structured address asks. */
	houseNumber: string;
	zip: string;
	city: string;
}

export interface Tenant extends BaseRecord<TenantId> {
	name: string;
	industry: Industry;
	brandColor: string;
	logoDataUrl: string | null;
	address: Address;
	vatNumber: string;
	iban: string;
	/** From the bank, for payments with a QR reference; '' when the workspace has none. */
	qrIban: string;
	invoiceSettings: InvoiceSettings;
	locale: string;
	timeZone: string;
	plan: PlanCode;
	billingCycle: 'monthly' | 'yearly';
	trialEndsAt: Timestamp | null;
	cancelledAt: Timestamp | null;
	enabledModules: ModuleKey[];
	paymentMethod: { brand: string; last4: string; expires: string } | null;
	featureFlags: string[];
	onboardingCompleted: boolean;
}

export interface NotificationPreferences {
	inApp: boolean;
	email: boolean;
	push: boolean;
	digest: 'never' | 'daily' | 'weekly';
}

export interface User extends BaseRecord<UserId> {
	email: string;
	firstName: string;
	lastName: string;
	avatarColor: string;
	avatarDataUrl: string | null;
	password: string;
	emailVerified: boolean;
	twoFactorEnabled: boolean;
	locale: string;
	globalRole: 'super_administrator' | null;
	notificationPreferences: NotificationPreferences;
	/** Appended to mails the person sends from their personal sender. */
	mailSignature: string;
}

export const permissions = [
	'contacts.read',
	'contacts.write',
	'calendar.read',
	'calendar.write',
	'documents.read',
	'documents.write',
	'mail.read',
	'mail.write',
	/** Send personal mail from the workspace's business senders (e.g. info@), not only from one's own. */
	'mail.business',
	'finance.read',
	'finance.write',
	'planner.read',
	'planner.write',
	'physio.read',
	'physio.write',
	'spitex.read',
	'spitex.write',
	/** Only the caller's own visits, and only in weeks that are released. `spitex.read` includes it. */
	'spitex.own.read',
	/** Release a week's plan to the staff, and withdraw it again. */
	'spitex.release',
	'team.manage',
	'roles.manage',
	'billing.manage',
	'settings.manage',
	'audit.read',
] as const;
export type Permission = (typeof permissions)[number];

export type RoleKind = 'administrator' | 'user' | 'custom';

export interface Role extends TenantRecord<RoleId> {
	name: string;
	kind: RoleKind;
	permissions: Permission[];
	/** The product template the role was made from (`spitex.care`); see @clinks/domain/products. */
	template: string | null;
}

export interface Membership extends TenantRecord<MembershipId> {
	userId: UserId;
	roleId: RoleId;
	status: 'active' | 'inactive';
	jobTitle: string;
}

export interface Invitation extends TenantRecord<InvitationId> {
	email: string;
	roleId: RoleId;
	status: 'pending' | 'accepted' | 'revoked';
	expiresAt: Timestamp;
	invitedBy: UserId;
}

export interface BrowserSession extends BaseRecord<SessionId> {
	userId: UserId;
	device: string;
	location: string;
	lastActiveAt: Timestamp;
	/** Set when someone who manages the team signed the person out; the device must sign in again. */
	endedAt?: Timestamp;
}

export type ContactKind = 'person' | 'company';

export interface Contact extends TenantRecord<ContactId> {
	kind: ContactKind;
	firstName: string;
	lastName: string;
	companyName: string;
	email: string;
	phone: string;
	address: Address;
	birthDate: CalendarDate | null;
	insurer: string;
	tags: string[];
	notes: string;
	archived: boolean;
	/** Optional health-care details, added on demand under "Feld hinzufügen". */
	ahvNumber?: string;
	insuranceNumber?: string;
	language?: string;
	billingMode?: string;
}

export const appointmentKinds = ['meeting', 'physio', 'spitex', 'other'] as const;
export type AppointmentKind = (typeof appointmentKinds)[number];
export type AppointmentStatus = 'planned' | 'confirmed' | 'done' | 'cancelled';

export const spitexServices = ['assessment', 'treatment_care', 'basic_care', 'housekeeping', 'support'] as const;
export type SpitexService = (typeof spitexServices)[number];

export const physioServices = ['general', 'complex', 'home', 'initial'] as const;
export type PhysioService = (typeof physioServices)[number];

export interface ArrivalWindow {
	from: string;
	to: string;
}

export interface Appointment extends TenantRecord<AppointmentId> {
	title: string;
	kind: AppointmentKind;
	status: AppointmentStatus;
	contactId: ContactId | null;
	/** `null` marks an open visit that still needs a staff member. */
	assigneeId: UserId | null;
	start: Timestamp;
	end: Timestamp;
	location: string;
	notes: string;
	seriesId: SeriesId | null;
	service: SpitexService | PhysioService | null;
	arrivalWindow: ArrivalWindow | null;
	billedInvoiceId: InvoiceId | null;
}

export interface Folder extends TenantRecord<FolderId> {
	name: string;
	parentId: FolderId | null;
}

export type AttachmentTarget =
	| { kind: 'contact'; id: ContactId }
	| { kind: 'task'; id: TaskId }
	| { kind: 'invoice'; id: InvoiceId }
	| { kind: 'expense'; id: ExpenseId };

export interface StoredDocument extends TenantRecord<DocumentId> {
	name: string;
	folderId: FolderId | null;
	mimeType: string;
	size: number;
	dataUrl: string;
	targets: AttachmentTarget[];
	uploadedBy: UserId;
	/** An archived file (an issued invoice or reminder): it can no longer be renamed, replaced or deleted. */
	locked: boolean;
}

export const vatRates = [810, 260, 380, 0] as const;
/** VAT rate in basis points, so 8.1 % = 810. */
export type VatRate = (typeof vatRates)[number];

export interface InvoiceLine {
	description: string;
	quantity: number;
	unitPrice: Rappen;
	vatRate: VatRate;
}

export interface Payment {
	date: CalendarDate;
	amount: Rappen;
	/** The bank file entry it was booked from; absent for payments entered by hand. */
	entryId?: string;
}

export const invoiceStatuses = ['draft', 'open', 'partially_paid', 'paid', 'overdue', 'reminded', 'cancelled'] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** A reminder sent for an invoice: its own payment deadline, fee and archived PDF; set by the server. */
export interface InvoiceReminder {
	level: number;
	date: CalendarDate;
	dueDate: CalendarDate;
	fee: Rappen;
	documentId: DocumentId | null;
}

export interface Invoice extends TenantRecord<InvoiceId> {
	number: string;
	kind: 'invoice' | 'credit_note';
	contactId: ContactId;
	issueDate: CalendarDate;
	dueDate: CalendarDate;
	status: InvoiceStatus;
	lines: InvoiceLine[];
	payments: Payment[];
	reminderLevel: number;
	/** The reminders sent through CLinks; older invoices only have `reminderLevel`. */
	reminders: InvoiceReminder[];
	notes: string;
	appointmentIds: AppointmentId[];
	/** What the invoice bills, from–to (Art. 26 MWSTG); `null` on invoices made before it was asked. */
	serviceFrom: CalendarDate | null;
	serviceTo: CalendarDate | null;
	/** The PDF/A archived when the invoice was issued, and its SHA-256; set by the server. */
	documentId: DocumentId | null;
	pdfSha256: string | null;
}

/** Where a mail of the outbox stands: waiting, handed to the mail server, refused or bounced, or held back. */
export type MailDelivery = 'queued' | 'sent' | 'bounced' | 'failed' | 'suppressed';

/** One invoice or reminder sent by e-mail; link openings are counted, nothing else is tracked. */
export interface InvoiceSend {
	id: InvoiceSendId;
	tenantId: TenantId;
	invoiceId: InvoiceId;
	kind: 'invoice' | 'reminder';
	/** Reminder level; null for the invoice itself. */
	level: number | null;
	documentId: DocumentId;
	recipient: string;
	method: DeliveryMethod;
	sentAt: Timestamp;
	/** Name of the person who sent it. */
	sentBy: string;
	linkExpiresAt: Timestamp | null;
	openedAt: Timestamp | null;
	openCount: number;
	delivery: MailDelivery;
}

export const expenseCategories = [
	'material',
	'rent',
	'vehicle',
	'insurance',
	'it',
	'advertising',
	'travel',
	'other',
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export interface Expense extends TenantRecord<ExpenseId> {
	date: CalendarDate;
	description: string;
	supplier: string;
	category: ExpenseCategory;
	amount: Rappen;
	vatRate: VatRate;
	receiptId: DocumentId | null;
	status: 'open' | 'booked';
}

export const taskStatuses = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task extends TenantRecord<TaskId> {
	title: string;
	description: string;
	status: TaskStatus;
	priority: TaskPriority;
	assigneeIds: UserId[];
	dueDate: CalendarDate | null;
	labels: string[];
	order: number;
	contactId: ContactId | null;
	checklist: { text: string; done: boolean }[];
}

export type CommentTarget =
	{ kind: 'task'; id: TaskId } | { kind: 'contact'; id: ContactId } | { kind: 'invoice'; id: InvoiceId };

export interface Comment extends TenantRecord<CommentId> {
	target: CommentTarget;
	authorId: UserId;
	body: string;
	mentions: UserId[];
}

export const mailFolders = ['inbox', 'sent', 'drafts', 'archive'] as const;
export type MailFolder = (typeof mailFolders)[number];

export interface MailMessage extends TenantRecord<MailId> {
	folder: MailFolder;
	from: string;
	fromName: string;
	to: string[];
	subject: string;
	body: string;
	sentAt: Timestamp;
	read: boolean;
	starred: boolean;
	contactId: ContactId | null;
	/** Set by the server: the Message-ID of mail sent through the outbox or filed from outside. */
	messageId: string | null;
	/** Set by the server for mail it sends: where the delivery stands; null for drafts and filed mail. */
	delivery: MailDelivery | null;
}

export interface MailTemplate extends TenantRecord<TemplateId> {
	name: string;
	subject: string;
	body: string;
}

export const campaignStatuses = ['draft', 'review', 'approved', 'scheduled', 'sent'] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export interface Campaign extends TenantRecord<CampaignId> {
	name: string;
	subject: string;
	previewText: string;
	body: string;
	audienceTag: string;
	status: CampaignStatus;
	scheduledAt: Timestamp | null;
	sentAt: Timestamp | null;
	approvedBy: UserId | null;
	stats: { recipients: number; opens: number; clicks: number; unsubscribes: number };
}

export const physioTariffs = ['7301', '7311', '7350'] as const;
export type PhysioTariff = (typeof physioTariffs)[number];

export interface Prescription extends TenantRecord<PrescriptionId> {
	contactId: ContactId;
	doctor: string;
	diagnosis: string;
	tariff: PhysioTariff;
	sessionsPrescribed: number;
	issuedOn: CalendarDate;
	validUntil: CalendarDate;
}

export type ClinicalNoteKind = 'physio' | 'spitex';

export interface ClinicalNote extends TenantRecord<NoteId> {
	kind: ClinicalNoteKind;
	contactId: ContactId;
	appointmentId: AppointmentId | null;
	date: CalendarDate;
	authorId: UserId;
	subjective: string;
	objective: string;
	assessment: string;
	plan: string;
}

export interface TimeEntry extends TenantRecord<TimeEntryId> {
	userId: UserId;
	appointmentId: AppointmentId | null;
	date: CalendarDate;
	minutes: number;
	description: string;
}

/** What staff see of a client they visit: enough to get there and call, not the client's record. */
export type VisitClient = Pick<
	Contact,
	'id' | 'tenantId' | 'kind' | 'firstName' | 'lastName' | 'companyName' | 'phone' | 'address'
>;

/** A staff member's own plan: their visits in released weeks, the clients of those visits and the releases. */
export interface MyVisits {
	visits: Appointment[];
	clients: VisitClient[];
	releases: WeekRelease[];
}

/**
 * A released week of the Spitex plan: while the record exists, staff see their own visits of that week.
 * `createdAt` is when it was released.
 */
export interface WeekRelease extends TenantRecord<WeekReleaseId> {
	/** The Monday of the week. */
	weekStart: CalendarDate;
	releasedBy: UserId;
}

export type NotificationKind = 'mention' | 'assignment' | 'invoice' | 'appointment' | 'plan' | 'system';

export interface AppNotification extends TenantRecord<NotificationId> {
	userId: UserId;
	kind: NotificationKind;
	/** Translation key and parameters so the text follows the reader's language. */
	message: { key: string; params: { [name: string]: string } };
	href: string;
	read: boolean;
}

export type AuditTargetKind =
	| 'contact'
	| 'appointment'
	| 'invoice'
	| 'expense'
	| 'task'
	| 'document'
	| 'mail'
	| 'campaign'
	| 'membership'
	| 'invitation'
	| 'role'
	| 'tenant'
	| 'note'
	| 'prescription'
	| 'plan'
	| 'session';

export interface AuditEntry extends TenantRecord<AuditEntryId> {
	actorId: UserId;
	action: string;
	target: { kind: AuditTargetKind; id: string; label: string };
}
