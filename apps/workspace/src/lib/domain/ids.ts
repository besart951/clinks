declare const brand: unique symbol;

/** A string identifier that cannot be mixed up with an identifier of another entity. */
export type Id<Name extends string> = string & { readonly [brand]: Name };

export type TenantId = Id<'Tenant'>;
export type UserId = Id<'User'>;
export type RoleId = Id<'Role'>;
export type MembershipId = Id<'Membership'>;
export type InvitationId = Id<'Invitation'>;
export type SessionId = Id<'Session'>;
export type ContactId = Id<'Contact'>;
export type AppointmentId = Id<'Appointment'>;
export type SeriesId = Id<'Series'>;
export type FolderId = Id<'Folder'>;
export type DocumentId = Id<'Document'>;
export type InvoiceId = Id<'Invoice'>;
export type ExpenseId = Id<'Expense'>;
export type TaskId = Id<'Task'>;
export type CommentId = Id<'Comment'>;
export type MailId = Id<'Mail'>;
export type TemplateId = Id<'Template'>;
export type CampaignId = Id<'Campaign'>;
export type PrescriptionId = Id<'Prescription'>;
export type NoteId = Id<'Note'>;
export type TimeEntryId = Id<'TimeEntry'>;
export type NotificationId = Id<'Notification'>;
export type AuditEntryId = Id<'AuditEntry'>;

export type RandomSource = () => number;

/** Creates a UUIDv7 so mock records sort by creation time like the persistent backend IDs. */
export function newId<T extends string>(now: number = Date.now(), random: RandomSource = Math.random): T {
	const bytes = new Uint8Array(16);
	let time = Math.floor(now);
	for (let index = 5; index >= 0; index--) {
		bytes[index] = time % 256;
		time = Math.floor(time / 256);
	}
	for (let index = 6; index < 16; index++) bytes[index] = Math.floor(random() * 256);
	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as T;
}
