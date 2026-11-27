import { z } from 'zod';

const uuid = z.uuid();

/** How long a «Teilen-Link» works: a day, a week or a month. */
export const shareDays = [1, 7, 30] as const;

export const documentShareInput = z.strictObject({ days: z.literal(shareDays) });
export type DocumentShareInput = z.infer<typeof documentShareInput>;

/** A share as the workspace sees it; the link itself is shown only once, when it is made. */
export const documentShareDto = z.object({
	id: uuid,
	expiresAt: z.string(),
	revokedAt: z.string().nullable(),
	openCount: z.number().int(),
	createdAt: z.string(),
});
export type DocumentShareView = z.infer<typeof documentShareDto>;

export const documentShareCreated = documentShareDto.extend({ url: z.string() });
export type DocumentShareCreated = z.infer<typeof documentShareCreated>;

/** What the recipient sees before downloading. */
export const sharedFileDetails = z.object({
	tenantName: z.string(),
	name: z.string(),
	size: z.number().int(),
	expiresAt: z.string(),
});
export type SharedFileDetails = z.infer<typeof sharedFileDetails>;

export const sharedFile = z.object({ name: z.string(), mimeType: z.string(), url: z.string() });
export type SharedFile = z.infer<typeof sharedFile>;
