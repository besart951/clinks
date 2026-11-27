/** A file or folder dragged inside the documents page; its own type keeps it apart from desktop file uploads. */
export interface DraggedItem {
	kind: 'document' | 'folder';
	id: string;
}

const itemType = 'application/x-clinks-item';

export function startItemDrag(event: DragEvent, item: DraggedItem) {
	if (!event.dataTransfer) return;
	event.dataTransfer.setData(itemType, JSON.stringify(item));
	event.dataTransfer.effectAllowed = 'move';
}

/** True while an internal item (not a desktop file) is dragged over the page. */
export function carriesItem(event: DragEvent) {
	return event.dataTransfer?.types.includes(itemType) ?? false;
}

export function carriesFiles(event: DragEvent) {
	return (event.dataTransfer?.types.includes('Files') ?? false) && !carriesItem(event);
}

export function readItem(event: DragEvent): DraggedItem | null {
	const raw = event.dataTransfer?.getData(itemType);
	if (!raw) return null;
	try {
		const item = JSON.parse(raw) as DraggedItem;
		return item.kind === 'document' || item.kind === 'folder' ? item : null;
	} catch {
		return null;
	}
}
