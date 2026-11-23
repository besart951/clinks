import { z } from 'zod';

/** One local transaction of the PowerSync upload queue; the API applies it atomically or not at all. */
export const syncWriteRequest = z.object({
	ops: z
		.array(
			z.object({
				op: z.enum(['PUT', 'PATCH', 'DELETE']),
				table: z.string().max(64),
				id: z.uuid(),
				data: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.min(1)
		.max(500),
});

export type SyncWriteRequest = z.infer<typeof syncWriteRequest>;

/** One browser's pre-sync module data. Only missing records can be imported. */
export const syncImportRequest = z.object({
	ops: z
		.array(
			z.object({
				op: z.literal('PUT'),
				table: z.string().max(64),
				id: z.uuid(),
				data: z.record(z.string(), z.unknown()),
			}),
		)
		.min(1)
		.max(25000),
});
