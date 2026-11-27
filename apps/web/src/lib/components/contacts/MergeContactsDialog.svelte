<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import Choice from '#lib/components/common/Choice.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { ContactMergeModel } from '#lib/features/contacts/contact-merge.svelte';
	import { mergeValue, type MergeField } from '@clinks/domain/contact-merge';
	import type { Contact } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * Merging contacts in three columns: the contact that stays on the left, another one on the right, the result in
	 * the middle. Equal values are greyed out; a differing value is taken by its arrow or by dragging it into the
	 * middle, and the middle can be edited.
	 */
	let { onMerge }: { onMerge: (primary: Contact, others: Contact[], patch: Partial<Contact>) => Promise<boolean> } =
		$props();
	const workspace = useWorkspace();
	const model = new ContactMergeModel();
	let open = $state(false);
	let busy = $state(false);
	/** The row a value is being dragged over, for the drop highlight. */
	let dropTarget = $state<MergeField | null>(null);

	const labels: Record<MergeField, string> = {
		firstName: 'ui.ws.field.first_name',
		lastName: 'ui.ws.field.last_name',
		companyName: 'ui.ws.field.company',
		email: 'ui.email',
		phone: 'ui.ws.field.phone',
		mobile: 'ui.ws.field.mobile',
		street: 'ui.ws.field.street',
		houseNumber: 'ui.ws.field.house_number',
		zip: 'ui.ws.field.zip',
		city: 'ui.ws.field.city',
		birthDate: 'ui.ws.field.birth_date',
		insurer: 'ui.ws.field.insurer',
		ahvNumber: 'ui.ws.field.ahv',
		insuranceNumber: 'ui.ws.field.insurance_number',
		language: 'ui.ws.field.language',
		notes: 'ui.ws.field.notes',
	};

	export function show(contacts: Contact[]) {
		model.start(contacts);
		open = true;
	}

	async function merge() {
		const kept = model.kept;
		if (!kept) return;
		busy = true;
		const ok = await onMerge(kept, model.others, model.patch());
		busy = false;
		if (ok) open = false;
	}

	/** A field of the result takes a value dragged from either side (instead of the browser pasting the drag text). */
	function dropZone(field: MergeField) {
		return {
			class: dropTarget === field ? 'ring-primary ring-2' : '',
			ondragover: (event: DragEvent) => {
				event.preventDefault();
				dropTarget = field;
			},
			ondragleave: () => (dropTarget = null),
			ondrop: (event: DragEvent) => {
				event.preventDefault();
				dropTarget = null;
				const id = event.dataTransfer?.getData('application/x-clinks-contact');
				const from = model.contacts.find((contact) => contact.id === id);
				if (from) model.take(field, from);
			},
		};
	}
</script>

{#snippet side(field: MergeField, contact: Contact, direction: 'left' | 'right')}
	{@const value = mergeValue(contact, field).trim()}
	{#if !value}
		<span class="text-muted-foreground px-2 py-1.5 text-sm">—</span>
	{:else if model.same(field)}
		<span class="text-muted-foreground truncate px-2 py-1.5 text-sm" title={value}>{value}</span>
	{:else}
		{@const taken = model.taken(field, contact)}
		<button
			type="button"
			draggable="true"
			class="hover:bg-accent flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-start text-sm {taken
				? 'border-primary bg-primary/5'
				: 'border-dashed'} {direction === 'right' ? 'flex-row-reverse text-end' : ''}"
			aria-label={workspace.t('ui.ws.contacts.merge_take', { value, field: workspace.t(labels[field]) })}
			aria-pressed={taken}
			ondragstart={(event) => {
				event.dataTransfer?.setData('application/x-clinks-contact', contact.id);
				event.dataTransfer!.effectAllowed = 'copy';
			}}
			onclick={() => model.take(field, contact)}
		>
			<span class="min-w-0 flex-1 truncate">{value}</span>
			{#if direction === 'left'}<ArrowRight class="size-3.5 shrink-0" />{:else}<ArrowLeft
					class="size-3.5 shrink-0"
				/>{/if}
		</button>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.contacts.merge_title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.contacts.merge_text')}</Dialog.Description>
		</Dialog.Header>
		{#if model.kept && model.other}
			{@const kept = model.kept}
			{@const other = model.other}
			<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
				<div class="contents">
					<div class="min-w-0 pb-2">
						<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.contacts.merge_kept')}</span>
						<span class="block truncate font-semibold">{contactName(kept)}</span>
					</div>
					<div class="pb-2 text-center">
						<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.contacts.merge_result')}</span>
						<Button variant="ghost" size="sm" onclick={() => model.swap()}>
							<ArrowLeftRight class="size-4" />{workspace.t('ui.ws.contacts.merge_swap')}
						</Button>
					</div>
					<div class="min-w-0 pb-2 text-end">
						<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.contacts.merge_merged')}</span>
						{#if model.others.length > 1}
							<Choice
								label={workspace.t('ui.ws.contacts.merge_merged')}
								bind:value={model.otherId}
								options={model.others.map((contact) => ({ value: contact.id, label: contactName(contact) }))}
								size="sm"
							/>
						{:else}
							<span class="block truncate font-semibold">{contactName(other)}</span>
						{/if}
					</div>
				</div>
				{#each model.fields as field (field)}
					<div class="contents {model.same(field) ? 'opacity-60' : ''}">
						<div class="flex min-w-0 justify-start">{@render side(field, kept, 'left')}</div>
						<!-- Dropping is the pointer shortcut; the arrows on both sides do the same by click or keyboard. -->
						<div>
							<label class="text-muted-foreground mb-0.5 block text-[11px]" for="merge-{field}">
								{workspace.t(labels[field])}
							</label>
							{#if field === 'notes'}
								<Textarea id="merge-{field}" rows={2} bind:value={model.values[field]} {...dropZone(field)} />
							{:else}
								<Input
									id="merge-{field}"
									type={field === 'birthDate' ? 'date' : field === 'email' ? 'email' : 'text'}
									bind:value={model.values[field]}
									{...dropZone(field)}
								/>
							{/if}
						</div>
						<div class="flex min-w-0 justify-end">{@render side(field, other, 'right')}</div>
					</div>
				{/each}
			</div>
			<p class="text-muted-foreground text-xs" role="status">
				{model.conflicts > 0
					? workspace.t('ui.ws.contacts.merge_conflicts', { count: model.conflicts })
					: workspace.t('ui.ws.contacts.merge_no_conflicts')}
				{workspace.t('ui.ws.contacts.merge_rest')}
			</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button disabled={busy || !model.kept} onclick={merge}>
				{workspace.t('ui.ws.contacts.merge_submit_count', { count: model.contacts.length })}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
