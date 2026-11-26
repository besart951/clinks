import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import SquareKanban from '@lucide/svelte/icons/square-kanban';
import Mail from '@lucide/svelte/icons/mail';
import FolderOpen from '@lucide/svelte/icons/folder-open';
import Wallet from '@lucide/svelte/icons/wallet';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import House from '@lucide/svelte/icons/house';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import History from '@lucide/svelte/icons/history';
import Settings from '@lucide/svelte/icons/settings';
import type { ModuleKey, Permission } from '@clinks/domain/types';

export interface NavigationItem {
	path: string;
	label: string;
	icon: Component<{ class?: string }>;
	module?: ModuleKey;
	permission?: Permission;
	shortcut?: string;
}

export interface NavigationGroup {
	label: string;
	items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
	{
		label: 'ui.ws.nav.overview',
		items: [{ path: '/dashboard', label: 'ui.ws.nav.dashboard', icon: LayoutDashboard, shortcut: 'd' }],
	},
	{
		label: 'ui.ws.nav.work',
		items: [
			{
				path: '/contacts',
				label: 'ui.ws.module.contacts',
				icon: Users,
				module: 'contacts',
				permission: 'contacts.read',
				shortcut: 'c',
			},
			{
				path: '/calendar',
				label: 'ui.ws.module.calendar',
				icon: CalendarDays,
				module: 'calendar',
				permission: 'calendar.read',
				shortcut: 'k',
			},
			{
				path: '/planner',
				label: 'ui.ws.module.planner',
				icon: SquareKanban,
				module: 'planner',
				permission: 'planner.read',
				shortcut: 't',
			},
			{ path: '/mail', label: 'ui.ws.module.mail', icon: Mail, module: 'mail', permission: 'mail.read', shortcut: 'm' },
			{
				path: '/documents',
				label: 'ui.ws.module.documents',
				icon: FolderOpen,
				module: 'documents',
				permission: 'documents.read',
				shortcut: 'o',
			},
		],
	},
	{
		label: 'ui.ws.nav.industry',
		items: [
			{
				path: '/physio',
				label: 'ui.ws.module.physio',
				icon: HeartPulse,
				module: 'physio',
				permission: 'physio.read',
				shortcut: 'p',
			},
			{
				path: '/spitex',
				label: 'ui.ws.module.spitex',
				icon: House,
				module: 'spitex',
				permission: 'spitex.read',
				shortcut: 's',
			},
			{
				path: '/visits',
				label: 'ui.ws.visits.title',
				icon: ClipboardList,
				module: 'spitex',
				permission: 'spitex.own.read',
			},
		],
	},
	{
		label: 'ui.ws.nav.administration',
		items: [
			{
				path: '/finance',
				label: 'ui.ws.module.finance',
				icon: Wallet,
				module: 'finance',
				permission: 'finance.read',
				shortcut: 'f',
			},
			{ path: '/activity', label: 'ui.ws.nav.activity', icon: History, permission: 'audit.read', shortcut: 'a' },
			{ path: '/settings', label: 'ui.ws.nav.settings', icon: Settings, shortcut: 'e' },
		],
	},
];

export const allNavigationItems = navigationGroups.flatMap((group) => group.items);

/**
 * What a person may do with a place in the app. `open`: go there. `locked`: not booked, and they may book it.
 * `denied`: booked, but their role does not allow it. `hidden`: not booked, and they cannot change that.
 * Navigation shows `open` and `locked` only, so staff are not confused by places they never use; the search also
 * lists `denied`, as «Kein Zugriff».
 */
export type NavigationAccess = 'open' | 'locked' | 'denied' | 'hidden';

export function navigationAccess(
	item: Pick<NavigationItem, 'module' | 'permission'>,
	session: { can(permission: Permission): boolean; hasModule(module: ModuleKey): boolean },
): NavigationAccess {
	if (item.module && !session.hasModule(item.module)) return session.can('billing.manage') ? 'locked' : 'hidden';
	if (item.permission && !session.can(item.permission)) return 'denied';
	return 'open';
}
