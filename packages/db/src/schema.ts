import type { AppointmentMailSettings } from '@clinks/domain/appointment-mail';
import type { InvoiceSettings } from '@clinks/domain/invoicing';
import type { MailDelivery } from '@clinks/domain/types';
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/** Set by the database on insert, so optional when writing. */
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface TenantTable {
	logoDataUrl: string | null;
	address: Defaulted<{ street: string; houseNumber: string; zip: string; city: string }>;
	vatNumber: Defaulted<string>;
	iban: Defaulted<string>;
	qrIban: Defaulted<string>;
	invoiceSettings: Defaulted<InvoiceSettings>;
	appointmentMail: Defaulted<AppointmentMailSettings>;
	id: string;
	name: string;
	industry: 'physio' | 'spitex' | 'services';
	brandColor: Defaulted<string>;
	locale: Defaulted<string>;
	timeZone: Defaulted<string>;
	plan: Defaulted<string>;
	billingCycle: Defaulted<'monthly' | 'yearly'>;
	trialEndsAt: Date | null;
	enabledModules: Defaulted<string[]>;
	featureFlags: Defaulted<string[]>;
	onboardingCompleted: Defaulted<boolean>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface UserTable {
	avatarDataUrl: string | null;
	notificationPreferences: Defaulted<{
		inApp: boolean;
		email: boolean;
		push: boolean;
		digest: 'never' | 'daily' | 'weekly';
	}>;
	id: string;
	email: string;
	firstName: Defaulted<string>;
	lastName: Defaulted<string>;
	mailSignature: Defaulted<string>;
	avatarColor: Defaulted<string>;
	locale: Defaulted<string>;
	globalRole: 'super_administrator' | null;
	emailVerifiedAt: Date | null;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface RoleTable {
	id: string;
	tenantId: string;
	name: string;
	kind: 'administrator' | 'user' | 'custom';
	permissions: Defaulted<string[]>;
	/** The product template the role was made from (`spitex.care`), if any. */
	template: Defaulted<string | null>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface MembershipTable {
	platformAccess: Defaulted<boolean>;
	id: string;
	tenantId: string;
	userId: string;
	roleId: string;
	status: Defaulted<'active' | 'inactive'>;
	jobTitle: Defaulted<string>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface InvitationTable {
	id: string;
	tenantId: string;
	email: string;
	roleId: string;
	status: Defaulted<'pending' | 'accepted' | 'revoked'>;
	expiresAt: Date;
	invitedBy: string;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface AuditTable {
	id: string;
	tenantId: string | null;
	actorId: string | null;
	action: string;
	target: Defaulted<string>;
	meta: Defaulted<Record<string, unknown>>;
	ip: string | null;
	createdAt: Timestamp;
}

export interface CredentialTable {
	userId: string;
	passwordHash: string;
	totpSecret: Uint8Array | null;
	totpEnabledAt: Date | null;
	totpLastStep: ColumnType<string | null, number | string | null | undefined, number | string | null>;
	failedAttempts: Defaulted<number>;
	lockedUntil: Date | null;
	passwordChangedAt: Timestamp;
}

export interface RecoveryCodeTable {
	id: string;
	userId: string;
	codeHash: Uint8Array;
	usedAt: Date | null;
}

export type MailKind = 'invoice' | 'reminder' | 'appointment' | 'personal' | 'campaign' | 'optin' | 'system';
export type MailStatus = MailDelivery;
export type ConsentSource = 'form' | 'manual' | 'import' | 'unsubscribe_link' | 'bounce';
/** One DNS record of a sender domain as last checked: what CLinks expects, whether it is there, what was found. */
export interface DomainCheck {
	record: 'spf' | 'dkim' | 'dmarc';
	ok: boolean;
	found: string | null;
}
export interface OutboxAttachment {
	documentId: string;
	filename: string;
	contentType: string;
	/** Checked before sending when given: archived invoices and reminders. */
	sha256?: string;
}

export type OneTimePurpose =
	| 'verify_email'
	| 'reset_password'
	| 'invitation'
	| 'two_factor'
	| 'invoice_link'
	| 'newsletter_optin'
	| 'document_share';

export interface OneTimeTokenTable {
	id: string;
	purpose: OneTimePurpose;
	userId: string | null;
	invitationId: string | null;
	tenantId: string | null;
	invoiceSendId: ColumnType<string | null, string | null | undefined, string | null>;
	newsletterRequestId: ColumnType<string | null, string | null | undefined, string | null>;
	documentShareId: ColumnType<string | null, string | null | undefined, string | null>;
	tokenHash: Uint8Array;
	attempts: Defaulted<number>;
	expiresAt: Date;
	usedAt: Date | null;
	createdAt: Timestamp;
}

/** A tenant's own bucket (auth schema): the secret is AES-GCM ciphertext, see apps/api `SecretBox`. */
export interface StorageConfigTable {
	id: string;
	tenantId: string;
	provider: 'infomaniak' | 'cloudflare' | 'custom';
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretCiphertext: string;
	secretHint: string;
	pathStyle: boolean;
	locationAcknowledgedAt: Date | null;
	active: Defaulted<boolean>;
	lastCheckAt: Date | null;
	lastCheckOk: boolean | null;
	createdBy: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface RefreshTokenTable {
	id: string;
	familyId: string;
	userId: string;
	tenantId: string | null;
	tokenHash: Uint8Array;
	device: Defaulted<string>;
	ip: string | null;
	expiresAt: Date;
	replacedAt: Date | null;
	revokedAt: Date | null;
	createdAt: Timestamp;
}

/** Synced tables are read and written generically through packages/sync-schema, so their rows stay loose. */
export type SyncedRow = { id: string; tenantId: string; revision: Generated<number> } & { [column: string]: unknown };

export interface Database {
	syncAccess: { id: string; tenantId: string; userId: string; readPermissions: string[] };
	billingAccounts: { tenantId: string; customerId: string; status: Defaulted<string> };
	billingEvents: { id: string; tenantId: string; createdAt: Timestamp };
	planningRooms: { tenantId: string; state: Uint8Array; updatedAt: Timestamp };
	bankImports: {
		id: string;
		tenantId: string;
		fileName: string;
		kind: 'camt.053' | 'camt.054';
		sha256: string;
		documentId: string;
		importedAt: Date;
		importedBy: string | null;
		credits: number;
		booked: number;
		duplicates: number;
	};
	bankEntries: {
		id: string;
		tenantId: string;
		importId: string;
		bankRef: string;
		bookedOn: string;
		amount: number;
		currency: string;
		reference: string;
		debtor: string;
		info: string;
		status: 'booked' | 'open' | 'ignored';
		invoiceId: string | null;
	};
	'auth.mailInboundAddresses': {
		localPart: string;
		tenantId: string;
		createdBy: string;
		active: Defaulted<boolean>;
		createdAt: Timestamp;
	};
	mailSuppressions: {
		tenantId: string;
		address: string;
		scope: 'all' | 'newsletter';
		reason: 'bounced' | 'unsubscribed' | 'complaint' | 'manual';
		createdAt: Timestamp;
	};
	mailDomains: {
		id: string;
		tenantId: string;
		domain: string;
		purpose: 'business' | 'newsletter';
		selector: string;
		dkimPublicKey: string;
		status: Defaulted<'pending' | 'verified' | 'failing'>;
		checks: Defaulted<DomainCheck[]>;
		checkedAt: Date | null;
		createdAt: Timestamp;
	};
	'auth.mailDomainKeys': { domainId: string; tenantId: string; privateKeyCiphertext: string };
	mailSenders: {
		id: string;
		tenantId: string;
		domainId: string;
		kind: 'business' | 'personal' | 'newsletter';
		address: string;
		displayName: string;
		replyTo: string | null;
		userId: string | null;
		signature: Defaulted<string>;
		isDefault: Defaulted<boolean>;
		createdAt: Timestamp;
	};
	mailOutbox: {
		id: string;
		tenantId: string;
		senderId: ColumnType<string | null, string | null | undefined, string | null>;
		kind: MailKind;
		fromName: string;
		replyTo: string | null;
		recipient: string;
		subject: string;
		textBody: string;
		htmlBody: string;
		attachments: Defaulted<OutboxAttachment[]>;
		headers: Defaulted<Record<string, string>>;
		contactId: string | null;
		campaignId: ColumnType<string | null, string | null | undefined, string | null>;
		status: Defaulted<MailStatus>;
		attempts: Defaulted<number>;
		error: string | null;
		messageId: string | null;
		createdAt: Timestamp;
		sentAt: Date | null;
	};
	newsletterForms: {
		id: string;
		tenantId: string;
		token: string;
		title: string;
		intro: string;
		tags: Defaulted<string[]>;
		consentText: string;
		active: Defaulted<boolean>;
		createdAt: Timestamp;
		updatedAt: Timestamp;
	};
	newsletterRequests: {
		id: string;
		tenantId: string;
		formId: string;
		firstName: string;
		lastName: string;
		email: string;
		ipHash: string | null;
		createdAt: Timestamp;
	};
	newsletterConsents: {
		id: string;
		tenantId: string;
		contactId: string;
		status: 'subscribed' | 'unsubscribed';
		source: ConsentSource;
		consentText: Defaulted<string>;
		note: Defaulted<string>;
		ipHash: string | null;
		actorId: string | null;
		campaignId: string | null;
		createdAt: Timestamp;
	};
	'auth.documentTextQueue': {
		documentId: string;
		tenantId: string;
		queuedAt: Defaulted<Date>;
	};
	'auth.mailRetention': {
		tenantId: string;
		checkedAt: Defaulted<Date>;
	};
	'auth.appointmentReminders': {
		appointmentId: string;
		tenantId: string;
		dueAt: Date;
	};
	'auth.campaignQueue': {
		campaignId: string;
		tenantId: string;
		dueAt: Date;
	};
	'auth.mailQueue': {
		outboxId: string;
		tenantId: string;
		dueAt: Defaulted<Date>;
		lockedUntil: Date | null;
	};
	documentShares: {
		id: string;
		tenantId: string;
		documentId: string;
		createdBy: string | null;
		expiresAt: Date;
		revokedAt: Date | null;
		openCount: Defaulted<number>;
		openedAt: Date | null;
		createdAt: Timestamp;
	};
	invoiceSends: {
		id: string;
		tenantId: string;
		invoiceId: string;
		kind: 'invoice' | 'reminder';
		level: number | null;
		documentId: string;
		recipient: string;
		method: 'attachment' | 'link';
		sentAt: Date;
		sentBy: string | null;
		linkExpiresAt: Date | null;
		openedAt: Date | null;
		openCount: Defaulted<number>;
		outboxId: ColumnType<string | null, string | null | undefined, string | null>;
	};
	documentVersions: {
		id: string;
		tenantId: string;
		documentId: string;
		objectKey: string;
		objectVersion: string;
		size: number;
		mimeType: string;
		authorId: string;
		/** The tenant's bucket the bytes live in; null for CLinks storage. */
		storageId: ColumnType<string | null, string | null | undefined, string | null>;
		createdAt: Timestamp;
	};
	folders: SyncedRow;
	documents: SyncedRow;
	invoices: SyncedRow;
	expenses: SyncedRow;
	tasks: SyncedRow;
	contact_comments: SyncedRow;
	task_comments: SyncedRow;
	invoice_comments: SyncedRow;
	mails: SyncedRow;
	templates: SyncedRow;
	campaigns: SyncedRow;
	prescriptions: SyncedRow;
	physio_notes: SyncedRow;
	spitex_notes: SyncedRow;
	time_entries: SyncedRow;
	spitex_week_releases: SyncedRow;
	notifications: SyncedRow;
	contacts: SyncedRow;
	appointments: SyncedRow;
	tenants: TenantTable;
	users: UserTable;
	roles: RoleTable;
	memberships: MembershipTable;
	invitations: InvitationTable;
	audit: AuditTable;
	'auth.credentials': CredentialTable;
	'auth.recoveryCodes': RecoveryCodeTable;
	'auth.oneTimeTokens': OneTimeTokenTable;
	'auth.refreshTokens': RefreshTokenTable;
	'auth.storageConfigs': StorageConfigTable;
}

export type TenantRow = Selectable<TenantTable>;
export type UserRow = Selectable<UserTable>;
export type RoleRow = Selectable<RoleTable>;
export type MembershipRow = Selectable<MembershipTable>;
export type InvitationRow = Selectable<InvitationTable>;
export type NewTenant = Insertable<TenantTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;
