import type { AppNotification } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** The signed-in person's notifications, newest first. */
export class NotificationsModel {
	readonly resource: Resource<AppNotification[]>;
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['notifications'], async () => {
			const userId = workspace.session.user?.id;
			const rows = await workspace.api.notifications.list((row) => row.userId === userId);
			return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
		});
	}

	get unread() {
		return (this.resource.data ?? []).filter((notification) => !notification.read).length;
	}

	text(notification: AppNotification) {
		return this.#workspace.t(notification.message.key, notification.message.params);
	}

	async markRead(notification: AppNotification) {
		if (notification.read) return;
		this.resource.patch((rows) => rows.map((row) => (row.id === notification.id ? { ...row, read: true } : row)));
		await this.#workspace.run(() =>
			this.#workspace.api.notifications.update(notification.id, notification.revision, { read: true }),
		);
	}

	async markAllRead() {
		const unread = (this.resource.data ?? []).filter((row) => !row.read);
		this.resource.patch((rows) => rows.map((row) => ({ ...row, read: true })));
		await this.#workspace.run(
			() =>
				Promise.all(
					unread.map((row) => this.#workspace.api.notifications.update(row.id, row.revision, { read: true })),
				),
			{ success: 'ui.ws.notifications.all_read' },
		);
	}
}
