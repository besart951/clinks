import type { ConfirmRequest } from '../../components/common/ConfirmDialog.svelte';
import type { TranslationParams } from '../../i18n/translator.svelte.ts';

export interface SignOutWorkspace {
	t: (key: string, params?: TranslationParams) => string;
	sync: { pendingCount(): Promise<number> } | null;
	session: { signOut(): Promise<void> };
}

/**
 * Signs out immediately when no local writes await upload; otherwise returns a destructive
 * confirmation request so the user can cancel before the local database is wiped.
 */
export async function requestSignOut(
	workspace: SignOutWorkspace,
	afterSignOut: () => Promise<void>,
): Promise<ConfirmRequest | null> {
	const proceed = async () => {
		await workspace.session.signOut();
		await afterSignOut();
	};
	const pending = (await workspace.sync?.pendingCount()) ?? 0;
	if (pending === 0) {
		await proceed();
		return null;
	}
	return {
		title: workspace.t('ui.ws.sync.discard_title'),
		description: workspace.t('ui.ws.sync.confirm_discard', { count: pending }),
		confirmLabel: workspace.t('ui.sign_out'),
		destructive: true,
		onConfirm: proceed,
	};
}
