<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import * as Sheet from '@clinks/ui-shared/components/ui/sheet';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import FormField from '$lib/components/common/FormField.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '$lib/components/common/ConfirmDialog.svelte';
	import { ContactFormModel } from '$lib/features/contacts/contact-form.svelte';
	import type { Contact } from '$lib/domain/types';
	import type { Draft } from '$lib/data/repository';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { onSaved }: { onSaved?: (contact: Contact) => void } = $props();

	const workspace = useWorkspace();
	const form = new ContactFormModel(workspace);
	let confirm = $state<ConfirmRequest | null>(null);
	let open = $state(false);

	/** Opens the sheet to create a contact (`null`) or edit an existing one. */
	export function show(contact: Contact | null, preset: Partial<Draft<Contact>> = {}) {
		form.start(contact, preset);
		open = true;
	}

	function requestClose(next: boolean) {
		if (next) return;
		if (!form.dirty) {
			open = false;
			return;
		}
		confirm = {
			title: workspace.t('ui.ws.unsaved.title'),
			description: workspace.t('ui.ws.unsaved.text'),
			confirmLabel: workspace.t('ui.ws.unsaved.discard'),
			destructive: true,
			onConfirm: () => {
				open = false;
			},
		};
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const saved = await form.save();
		if (!saved) return;
		open = false;
		onSaved?.(saved);
	}

	function onTagKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			form.addTag();
		}
	}
</script>

<Sheet.Root {open} onOpenChange={requestClose}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>{form.editing ? workspace.t('ui.ws.contacts.edit') : workspace.t('ui.ws.command.new_contact')}</Sheet.Title>
			<Sheet.Description>{workspace.t('ui.ws.contacts.form_text')}</Sheet.Description>
		</Sheet.Header>
		<form id="contact-form" class="space-y-4 px-4" onsubmit={submit} novalidate>
			<Tabs.Root value={form.value.kind} onValueChange={(kind) => (form.value.kind = kind as 'person' | 'company')}>
				<Tabs.List class="w-full">
					<Tabs.Trigger value="person">{workspace.t('ui.ws.contacts.kind_person')}</Tabs.Trigger>
					<Tabs.Trigger value="company">{workspace.t('ui.ws.contacts.kind_company')}</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
			{#if form.value.kind === 'person'}
				<div class="grid grid-cols-2 gap-3">
					<FormField id="c-first" label={workspace.t('ui.ws.field.first_name')} error={form.fields.firstName}>
						<Input id="c-first" bind:value={form.value.firstName} autocomplete="off" />
					</FormField>
					<FormField id="c-last" label={workspace.t('ui.ws.field.last_name')} error={form.fields.lastName}>
						<Input id="c-last" bind:value={form.value.lastName} aria-invalid={!!form.fields.lastName} autocomplete="off" />
					</FormField>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<FormField id="c-birth" label={workspace.t('ui.ws.field.birth_date')}>
						<Input id="c-birth" type="date" value={form.value.birthDate ?? ''} oninput={(event) => (form.value.birthDate = event.currentTarget.value || null)} />
					</FormField>
					<FormField id="c-insurer" label={workspace.t('ui.ws.field.insurer')}>
						<Input id="c-insurer" bind:value={form.value.insurer} />
					</FormField>
				</div>
			{:else}
				<FormField id="c-company" label={workspace.t('ui.ws.field.company')} error={form.fields.companyName}>
					<Input id="c-company" bind:value={form.value.companyName} aria-invalid={!!form.fields.companyName} />
				</FormField>
			{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<FormField id="c-email" label={workspace.t('ui.email')} error={form.fields.email}>
					<Input id="c-email" type="email" bind:value={form.value.email} aria-invalid={!!form.fields.email} />
				</FormField>
				<FormField id="c-phone" label={workspace.t('ui.ws.field.phone')} error={form.fields.phone}>
					<Input id="c-phone" type="tel" bind:value={form.value.phone} aria-invalid={!!form.fields.phone} />
				</FormField>
			</div>
			<FormField id="c-street" label={workspace.t('ui.ws.field.street')}>
				<Input id="c-street" bind:value={form.value.address.street} autocomplete="street-address" />
			</FormField>
			<div class="grid grid-cols-[7rem_1fr] gap-3">
				<FormField id="c-zip" label={workspace.t('ui.ws.field.zip')} error={form.fields['address.zip']}>
					<Input id="c-zip" bind:value={form.value.address.zip} inputmode="numeric" aria-invalid={!!form.fields['address.zip']} />
				</FormField>
				<FormField id="c-city" label={workspace.t('ui.ws.field.city')}>
					<Input id="c-city" bind:value={form.value.address.city} />
				</FormField>
			</div>
			<FormField id="c-tags" label={workspace.t('ui.ws.field.tags')} hint={workspace.t('ui.ws.contacts.tags_hint')}>
				<div class="space-y-2">
					{#if form.value.tags.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each form.value.tags as tag (tag)}
								<span class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
									{tag}
									<button type="button" class="hover:bg-background rounded-full p-0.5" onclick={() => form.removeTag(tag)} aria-label={workspace.t('ui.ws.contacts.remove_tag', { tag })}><X class="size-3" /></button>
								</span>
							{/each}
						</div>
					{/if}
					<Input id="c-tags" bind:value={form.tagInput} onkeydown={onTagKey} onblur={() => form.addTag()} />
				</div>
			</FormField>
			<FormField id="c-notes" label={workspace.t('ui.ws.field.notes')}>
				<Textarea id="c-notes" rows={3} bind:value={form.value.notes} />
			</FormField>
		</form>
		<Sheet.Footer class="flex-row justify-end">
			<Button variant="outline" onclick={() => requestClose(false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button type="submit" form="contact-form" disabled={form.busy}>{workspace.t('ui.save')}</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
<ConfirmDialog bind:request={confirm} />
