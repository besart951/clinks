import { atTime } from '@clinks/domain/dates';
import { newId } from '@clinks/domain/ids';
import { visitNeedDays } from '@clinks/domain/visit-needs';
import type { Appointment, VisitNeed } from '@clinks/domain/types';
import { stamp, type WorkspaceCache } from './database.ts';

/** Mock equivalent of the database trigger for the confirmed period. */
export function generateVisits(db: WorkspaceCache, need: VisitNeed) {
	const appointments = db.table('appointments');
	for (const day of visitNeedDays(need)) {
		const start = atTime(day, need.startTime);
		appointments.push(
			stamp<Appointment>({
				id: newId(),
				tenantId: need.tenantId,
				kind: 'spitex',
				status: 'planned',
				title: need.title,
				notes: need.notes,
				location: '',
				contactId: need.contactId,
				seriesId: need.id,
				assigneeId: null,
				start,
				end: new Date(Date.parse(start) + need.durationMinutes * 60000).toISOString(),
				arrivalWindow: need.arrivalWindow,
				service: null,
				billedInvoiceId: null,
			}),
		);
	}
}
