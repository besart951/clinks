import type { Locale } from '@clinks/i18n-types/catalog';
import type { Workspace } from '../../workspace.svelte.ts';

/** Switches the language now and, once signed in, keeps it in the profile for the next sign-in. */
export async function chooseLocale(workspace: Workspace, locale: Locale) {
	workspace.i18n.setLocale(locale);
	if (workspace.session.user) await workspace.account.updateProfile({ locale }).catch(() => undefined);
}
