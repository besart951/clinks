<script lang="ts">
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Clock from '@lucide/svelte/icons/clock';
	import UserCog from '@lucide/svelte/icons/user-cog';
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
	<div class="bg-muted flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm" role="status">
		<Clock class="size-4" />
		{workspace.t('ui.ws.banner.trial', { days: trialDays })}
		<a class="font-medium underline underline-offset-4" href={href('/settings/billing')}>
			{workspace.t('ui.ws.banner.choose_plan')}
		</a>
		<button class="text-muted-foreground hover:text-foreground text-xs" onclick={() => (trialHidden = true)}>
			{workspace.t('ui.ws.banner.hide')}
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
