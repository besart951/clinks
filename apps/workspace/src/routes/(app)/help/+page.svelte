<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import { routeQuery, setQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const tab = $derived(routeQuery(page.url).get('tab') ?? 'help');
	const questions = ['invite', 'modules', 'qr', 'offline', 'export', 'roles'];
	const releases = [
		{ version: '0.4', date: '2026-11-21', items: ['ui.ws.help.release_four_a', 'ui.ws.help.release_four_b'] },
		{ version: '0.3', date: '2026-11-14', items: ['ui.ws.help.release_three_a', 'ui.ws.help.release_three_b'] },
		{ version: '0.2', date: '2026-11-03', items: ['ui.ws.help.release_two_a'] },
	];
	let message = $state('');

	function send(event: SubmitEvent) {
		event.preventDefault();
		if (!message.trim()) return;
		toast.success(workspace.t('ui.ws.help.sent'));
		message = '';
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.help.title')} · CLinks</title></svelte:head>

<PageHeader title={workspace.t('ui.ws.help.title')} />
<Tabs.Root value={tab} onValueChange={(value) => setQuery(page.url, { tab: value === 'help' ? null : value })}>
	<Tabs.List class="mb-4">
		<Tabs.Trigger value="help">{workspace.t('ui.ws.help.faq')}</Tabs.Trigger>
		<Tabs.Trigger value="changelog">{workspace.t('ui.ws.help.changelog')}</Tabs.Trigger>
		<Tabs.Trigger value="legal">{workspace.t('ui.ws.help.legal')}</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="help">
		<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
			<div class="space-y-2">
				{#each questions as question (question)}
					<details class="group rounded-xl border px-4 py-3">
						<summary class="cursor-pointer list-none font-medium">{workspace.t(`ui.ws.help.q_${question}`)}</summary>
						<p class="text-muted-foreground mt-2 text-sm">{workspace.t(`ui.ws.help.a_${question}`)}</p>
					</details>
				{/each}
			</div>
			<Card.Root class="h-fit">
				<Card.Header
					><Card.Title>{workspace.t('ui.ws.help.contact')}</Card.Title><Card.Description
						>{workspace.t('ui.ws.help.contact_text')}</Card.Description
					></Card.Header
				>
				<Card.Content>
					<form class="space-y-3" onsubmit={send}>
						<FormField id="help-message" label={workspace.t('ui.ws.mail.message')}
							><Textarea id="help-message" rows={5} bind:value={message} /></FormField
						>
						<Button type="submit" class="w-full" disabled={!message.trim()}>{workspace.t('ui.ws.mail.send')}</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</div>
	</Tabs.Content>
	<Tabs.Content value="changelog">
		<ol class="space-y-4">
			{#each releases as release (release.version)}
				<li class="rounded-xl border p-4">
					<p class="font-semibold">
						{workspace.t('ui.ws.help.version', { version: release.version })}
						<span class="text-muted-foreground text-sm font-normal">· {workspace.i18n.date(release.date)}</span>
					</p>
					<ul class="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
						{#each release.items as item (item)}<li>{workspace.t(item)}</li>{/each}
					</ul>
				</li>
			{/each}
		</ol>
	</Tabs.Content>
	<Tabs.Content value="legal">
		<div class="grid gap-4 lg:grid-cols-2">
			<Card.Root
				><Card.Header><Card.Title>{workspace.t('ui.ws.help.terms')}</Card.Title></Card.Header><Card.Content
					class="text-muted-foreground text-sm">{workspace.t('ui.ws.help.terms_text')}</Card.Content
				></Card.Root
			>
			<Card.Root
				><Card.Header><Card.Title>{workspace.t('ui.ws.help.privacy')}</Card.Title></Card.Header><Card.Content
					class="text-muted-foreground text-sm">{workspace.t('ui.ws.help.privacy_text')}</Card.Content
				></Card.Root
			>
		</div>
	</Tabs.Content>
</Tabs.Root>
