<script lang="ts">
	import * as Command from '@clinks/ui/components/ui/command';
	import { CommandSearch, type CommandEntry } from '#lib/features/shell/command-search.svelte';
	import { navigate } from '#lib/navigation';
	import { useQuickCreate } from '#lib/features/shell/quick-create.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();
	const workspace = useWorkspace();
	const search = new CommandSearch(workspace);
	const quick = useQuickCreate();
	const groups: CommandEntry['group'][] = [
		'actions',
		'pages',
		'contacts',
		'appointments',
		'invoices',
		'tasks',
		'mails',
	];

	function onOpenChange(next: boolean) {
		open = next;
		if (next) void search.load();
	}

	async function choose(entry: CommandEntry) {
		open = false;
		if (entry.create) quick[entry.create]();
		else await navigate(entry.path);
	}
</script>

<Command.Dialog
	{open}
	{onOpenChange}
	title={workspace.t('ui.ws.command.title')}
	description={workspace.t('ui.ws.command.description')}
>
	<Command.Input placeholder={workspace.t('ui.ws.command.placeholder')} />
	<Command.List>
		<Command.Empty>{search.loading ? workspace.t('ui.loading') : workspace.t('ui.ws.command.empty')}</Command.Empty>
		{#each groups as group (group)}
			{@const entries = search.entries.filter((entry) => entry.group === group)}
			{#if entries.length > 0}
				<Command.Group heading={workspace.t(`ui.ws.command.group_${group}`)}>
					{#each entries as entry (entry.id)}
						<Command.Item value={`${entry.label} ${entry.detail} ${entry.id}`} onSelect={() => choose(entry)}>
							<span class="truncate">{entry.label}</span>
							{#if entry.detail}<span class="text-muted-foreground ml-auto truncate text-xs">{entry.detail}</span>{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			{/if}
		{/each}
	</Command.List>
</Command.Dialog>
