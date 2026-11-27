import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';
import Archive from '@lucide/svelte/icons/archive';
import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
import Inbox from '@lucide/svelte/icons/inbox';
import Mail from '@lucide/svelte/icons/mail';
import MailOpen from '@lucide/svelte/icons/mail-open';
import Reply from '@lucide/svelte/icons/reply';
import SquareKanban from '@lucide/svelte/icons/square-kanban';
import Star from '@lucide/svelte/icons/star';
import StarOff from '@lucide/svelte/icons/star-off';
import Trash2 from '@lucide/svelte/icons/trash-2';
import type { MailId } from '@clinks/domain/ids';
import type { MailMessage } from '@clinks/domain/types';
import { waiting } from '@clinks/domain/mail-threads';
import { snoozeChoices } from '@clinks/domain/snooze';
import { ListModel, type ListAction } from '../list/list-model.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import type { MailboxModel } from './mailbox.svelte.ts';
import { startMailDrag } from './mail-drag.ts';

/** What the mail list hands back to the page, which owns the compose sheet and the appointment sheet. */
export interface MailListHandlers {
	open(mail: MailMessage): void;
	reply(mail: MailMessage): void;
	appointment(mail: MailMessage): void;
}

/**
 * The mail list: a click opens a mail beside the list, Ctrl and Shift pick several. Swiping right toggles
 * read, swiping left archives.
 */
export function mailList(workspace: Workspace, mailbox: MailboxModel, handlers: MailListHandlers) {
	const t = workspace.t.bind(workspace);
	const can = (permission: Parameters<typeof workspace.session.can>[0]) => workspace.session.can(permission);
	const allStarred = (mails: MailMessage[]) => mails.every((mail) => mail.starred);
	const allRead = (mails: MailMessage[]) => mails.every((mail) => mail.read);
	const archived = (mails: MailMessage[]) => mails.every((mail) => mail.folder === 'archive');
	const writes = () => can('mail.write');
	/** Read, archive and delete act on the whole conversation in the folder, as in mail programs. */
	const whole = (mails: MailMessage[]) => mails.flatMap((mail) => mailbox.threadOf(mail));

	const actions = (): ListAction<MailMessage>[] => [
		{
			id: 'reply',
			label: () => t('ui.ws.mail.reply'),
			icon: () => Reply,
			single: true,
			key: 'r',
			when: (mails) => writes() && mails[0].folder !== 'drafts',
			run: (mails) => handlers.reply(mails[0]),
		},
		{
			id: 'star',
			label: (mails) => t(allStarred(mails) ? 'ui.ws.mail.unstar' : 'ui.ws.mail.star'),
			icon: (mails) => (allStarred(mails) ? StarOff : Star),
			inline: true,
			key: 's',
			when: writes,
			pressed: allStarred,
			pressedClass: 'fill-amber-400 text-amber-400',
			run: (mails) => mailbox.setStar(mails, !allStarred(mails)),
		},
		{
			id: 'read',
			label: (mails) => t(allRead(whole(mails)) ? 'ui.ws.mail.mark_unread' : 'ui.ws.mail.mark_read'),
			icon: (mails) => (allRead(whole(mails)) ? Mail : MailOpen),
			inline: true,
			key: 'u',
			when: (mails) => writes() && mails.every((mail) => mail.folder !== 'drafts'),
			run: (mails) => mailbox.setRead(whole(mails), !allRead(whole(mails))),
		},
		{
			id: 'archive',
			label: (mails) => t(archived(mails) ? 'ui.ws.mail.to_inbox' : 'ui.ws.contacts.archive'),
			icon: (mails) => (archived(mails) ? Inbox : Archive),
			inline: true,
			key: 'e',
			when: (mails) => writes() && mails.every((mail) => mail.folder !== 'drafts'),
			run: (mails) => mailbox.moveTo(whole(mails), archived(mails) ? 'inbox' : 'archive'),
		},
		{
			id: 'snooze',
			label: () => t('ui.ws.mail.snooze'),
			icon: () => AlarmClock,
			when: (mails) => writes() && mails.every((mail) => mail.folder !== 'drafts' && !waiting(mail, mailbox.now)),
			run: () => undefined,
			choices: (mails) =>
				snoozeChoices(new Date()).map(({ choice, until }) => ({
					id: choice,
					label: t('ui.ws.mail.snooze_until', {
						choice: t(`ui.ws.mail.snooze.${choice}`),
						when: workspace.i18n.dateTime(until.toISOString()),
					}),
					run: () => mailbox.snooze(whole(mails), until),
				})),
		},
		{
			id: 'unsnooze',
			label: () => t('ui.ws.mail.unsnooze'),
			icon: () => AlarmClockOff,
			inline: true,
			when: (mails) => writes() && mails.every((mail) => waiting(mail, mailbox.now)),
			run: (mails) => mailbox.snooze(whole(mails), null),
		},
		{
			id: 'task',
			label: () => t('ui.ws.mail.to_task'),
			icon: () => SquareKanban,
			single: true,
			when: () => can('planner.write') && workspace.session.hasModule('planner'),
			run: (mails) => mailbox.toTask(mails[0]),
		},
		{
			id: 'appointment',
			label: () => t('ui.ws.mail.to_appointment'),
			icon: () => CalendarPlus,
			single: true,
			when: () => can('calendar.write'),
			run: (mails) => handlers.appointment(mails[0]),
		},
		{
			id: 'delete',
			label: () => t('ui.ws.delete'),
			icon: () => Trash2,
			inline: true,
			key: 'Delete',
			destructive: true,
			when: writes,
			run: (mails) => mailbox.remove(whole(mails)),
		},
	];

	const list: ListModel<MailMessage, MailId> = new ListModel<MailMessage, MailId>({
		t,
		name: () => t(`ui.ws.mail.folder.${mailbox.folder}`),
		items: () => mailbox.messages,
		id: (mail) => mail.id,
		label: (mail) => mail.subject || t('ui.ws.mail.no_subject'),
		actions,
		open: handlers.open,
		openOn: 'click',
		swipe: { start: 'read', end: 'archive' },
		// Dragging a selected mail takes the whole selection, each with its conversation.
		drag: (event, mail) => {
			if (writes())
				startMailDrag(
					event,
					whole(list.targets(mail)).map((entry) => entry.id),
				);
		},
	});
	return list;
}
