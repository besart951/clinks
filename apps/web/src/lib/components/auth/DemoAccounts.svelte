<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { demoPassword } from '#lib/data/seed';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { onPick }: { onPick: (email: string, password: string) => void } = $props();
	const workspace = useWorkspace();
	const accounts = [
		{ email: 'besi@stille.ch', role: 'ui.ws.auth.demo_admin' },
		{ email: 'sandra.roth@stille.ch', role: 'ui.ws.auth.demo_user' },
		{ email: 'jonas.keller@stille.ch', role: 'ui.ws.auth.demo_accounting' },
		{ email: 'admin@clinks.ch', role: 'ui.ws.auth.demo_platform' },
	];
</script>

<section class="bg-muted/50 space-y-2 rounded-xl border p-3 text-sm" aria-labelledby="demo-accounts">
	<p id="demo-accounts" class="flex items-center gap-2 font-medium">
		<KeyRound class="size-4" />{workspace.t('ui.ws.auth.demo_title')}
	</p>
	<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.auth.demo_text', { password: demoPassword })}</p>
	<ul class="grid gap-1">
		{#each accounts as account (account.email)}
			<li>
				<button
					type="button"
					class="hover:bg-background flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left"
					onclick={() => onPick(account.email, demoPassword)}
				>
					<span class="truncate">{account.email}</span>
					<span class="text-muted-foreground shrink-0 text-xs">{workspace.t(account.role)}</span>
				</button>
			</li>
		{/each}
	</ul>
</section>
