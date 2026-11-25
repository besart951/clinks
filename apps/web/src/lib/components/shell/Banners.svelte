<script lang="ts">
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Clock from '@lucide/svelte/icons/clock';
	import X from '@lucide/svelte/icons/x';
	import UserCog from '@lucide/svelte/icons/user-cog';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { Button } from '@clinks/ui/components/ui/button';
	import { daysBetween, today, toCalendarDate } from '@clinks/domain/dates';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const trialDays = $derived(
		session.tenant?.trialEndsAt ? Math.max(daysBetween(today(), toCalendarDate(session.tenant.trialEndsAt)), 0) : null,
	);
	let trialHidden = $state(false);

	async function stopImpersonating() {
		await session.stopImpersonating();
		await navigate('/admin');
	}
</script>

<!-- The live region exists from the start; only its content changes, so screen readers announce the update. -->
<div role="status">
	{#if workspace.platform.updater.available}
		<div class="bg-primary text-primary-foreground flex items-center justify-center gap-3 px-4 py-1.5 text-sm">
			<RefreshCw class="size-4" aria-hidden="true" />
			{workspace.t('ui.ws.update.available')}
			<Button size="xs" variant="secondary" onclick={() => workspace.platform.updater.apply()}>
				{workspace.t('ui.ws.update.reload')}
			</Button>
		</div>
	{/if}
</div>
{#if session.impersonatorId}
	<div class="flex items-center justify-center gap-3 bg-violet-600 px-4 py-1.5 text-sm text-white" role="status">
		<UserCog class="size-4" />
		{workspace.t('ui.ws.banner.impersonating', { name: session.displayName })}
		<Button size="xs" variant="secondary" onclick={stopImpersonating}>
			{workspace.t('ui.ws.banner.stop_impersonating')}
		</Button>
	</div>
{/if}
{#if workspace.network.offline}
	<div class="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm text-amber-950" role="alert">
		<WifiOff class="size-4" />
		{workspace.t('ui.ws.banner.offline')}
	</div>
{/if}
{#if trialDays !== null && !trialHidden && session.can('billing.manage')}
	<!-- One line also on a phone: the hide button is an icon there. -->
	<div class="bg-muted flex items-center justify-center gap-x-3 px-4 py-1 text-sm" role="status">
		<Clock class="size-4 shrink-0" />
		<span class="min-w-0 truncate">{workspace.t('ui.ws.banner.trial', { days: trialDays })}</span>
		<a class="shrink-0 font-medium underline underline-offset-4" href={href('/settings/billing')}>
			{workspace.t('ui.ws.banner.choose_plan')}
		</a>
		<button
			class="text-muted-foreground hover:text-foreground grid min-h-8 min-w-8 shrink-0 place-items-center rounded-md text-xs sm:min-w-0"
			aria-label={workspace.t('ui.ws.banner.hide')}
			onclick={() => (trialHidden = true)}
		>
			<X class="size-4 sm:hidden" /><span class="hidden sm:inline">{workspace.t('ui.ws.banner.hide')}</span>
		</button>
	</div>
{/if}
{#if session.tenant?.cancelledAt}
	<div class="bg-destructive/10 text-destructive px-4 py-1.5 text-center text-sm" role="status">
		{workspace.t('ui.ws.banner.cancelled')}
		<a class="font-medium underline underline-offset-4" href={href('/settings/billing')}>
			{workspace.t('ui.ws.billing.resume')}
		</a>
	</div>
{/if}
