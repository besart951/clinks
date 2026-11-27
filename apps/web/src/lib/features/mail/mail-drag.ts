/** Mails dragged from the list, by id; their own type keeps them apart from files and other items. */
const mailType = 'application/x-clinks-mails';

export function startMailDrag(event: DragEvent, ids: string[]) {
	if (!event.dataTransfer) return;
	event.dataTransfer.setData(mailType, JSON.stringify(ids));
	event.dataTransfer.effectAllowed = 'move';
}

/** True while mails are dragged; the drop targets show only then. */
export function carriesMails(event: DragEvent) {
	return event.dataTransfer?.types.includes(mailType) ?? false;
}

export function readMailDrag(event: DragEvent): string[] {
	try {
		const ids: unknown = JSON.parse(event.dataTransfer?.getData(mailType) || '[]');
		return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}
