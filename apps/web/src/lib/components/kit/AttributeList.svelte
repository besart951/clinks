<script lang="ts" module>
	import type { InlineFieldSpec } from './inline-edit.svelte';

	export interface AttributeListSpec {
		fields: InlineFieldSpec[];
		readonly?: boolean;
	}
</script>

<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import InlineField from './InlineField.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { list, onsave }: { list: AttributeListSpec; onsave: (field: InlineFieldSpec, value: string) => unknown } =
		$props();

	const workspace = useWorkspace();
	/** Optional fields the user just added; they stay visible (even empty) until removed. */
	let added = $state<string[]>([]);
	const visible = $derived(
		list.fields.filter((field) => !field.removable || field.value !== '' || added.includes(field.key)),
	);
	const addable = $derived(
		list.readonly
			? []
			: list.fields.filter((field) => field.removable && field.value === '' && !added.includes(field.key)),
	);

	function add(key: string) {
		added = [...added, key];
	}

	async function remove(field: InlineFieldSpec) {
		added = added.filter((key) => key !== field.key);
		if (field.value !== '') await onsave(field, '');
	}
</script>

<div class="grid">
	{#each visible as field (field.key)}
		<InlineField
			field={list.readonly ? { ...field, readonly: true } : field}
			onsave={(value) => onsave(field, value)}
			onremove={() => remove(field)}
			autostart={added.includes(field.key) && field.value === ''}
		/>
	{/each}
	{#if addable.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="text-muted-foreground hover:bg-accent hover:text-foreground mt-0.5 inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md px-2 text-[13px]"
					>
						<Plus class="size-3.5" />{workspace.t('ui.ws.inline.add_field')}
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="max-h-64 min-w-48 overflow-y-auto">
				{#each addable as field (field.key)}
					<DropdownMenu.Item onclick={() => add(field.key)}>{field.label}</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>
