<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import FileText from '@lucide/svelte/icons/file-text';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import MailNav from '#lib/components/mail/MailNav.svelte';
	import { placeholders } from '@clinks/domain/placeholders';
	import { Resource } from '#lib/state/resource.svelte';
	import type { MailTemplate } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const api = workspace.api.templates;
	const resource = new Resource(workspace.db, ['templates'], async () =>
		(await api.list()).sort((left, right) => left.name.localeCompare(right.name)),
	);
	const canWrite = $derived(workspace.session.can('mail.write'));
	let editing = $state<MailTemplate | null>(null);
	let open = $state(false);
	let value = $state({ name: '', subject: '', body: '' });
	let fields = $state<{ [field: string]: string }>({});
	onMount(() => resource.connect());

	function edit(template: MailTemplate | null) {
		editing = template;
		value = template
			? { name: template.name, subject: template.subject, body: template.body }
			: { name: '', subject: '', body: '' };
		fields = {};
		open = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		try {
			if (editing) await api.update(editing.id, editing.revision, value);
			else await api.create(value);
			toast.success(workspace.t('ui.ws.mail.template_saved'));
			open = false;
		} catch (error) {
			fields = workspace.fieldErrors(error);
			if (Object.keys(fields).length === 0) toast.error(workspace.message(error));
		}
	}

	async function remove(template: MailTemplate) {
		await workspace.run(() => api.remove(template.id), {
			success: 'ui.ws.mail.template_deleted',
			undo: () => api.restore(template),
		});
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.mail.templates')} · CLinks</title></svelte:head>

<ModuleGate module="mail" permission="mail.read">
	<PageHeader title={workspace.t('ui.ws.module.mail')}>
		{#snippet actions()}{#if canWrite}<Button onclick={() => edit(null)}>
					<Plus class="size-4" />{workspace.t('ui.ws.mail.new_template')}
				</Button>{/if}{/snippet}
	</PageHeader>
	<MailNav />
	<AsyncView {resource} isEmpty={(rows) => rows.length === 0}>
		{#snippet empty()}<EmptyState icon={FileText} title={workspace.t('ui.ws.mail.no_templates')} />{/snippet}
		{#snippet children(templates)}
			<ul class="divide-y rounded-xl border">
				{#each templates as template (template.id)}
					<li class="flex items-center gap-3 px-4 py-3 text-sm">
						<FileText class="text-muted-foreground size-4" />
						<div class="min-w-0 flex-1">
							<p class="font-medium">{template.name}</p>
							<p class="text-muted-foreground truncate">{template.subject}</p>
						</div>
						{#if canWrite}
							<Button variant="ghost" size="sm" onclick={() => edit(template)}>{workspace.t('ui.ws.edit')}</Button>
							<Button variant="ghost" size="sm" class="text-destructive" onclick={() => remove(template)}>
								{workspace.t('ui.ws.delete')}
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root bind:open>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>
				{editing ? workspace.t('ui.ws.mail.edit_template') : workspace.t('ui.ws.mail.new_template')}
			</Dialog.Title>
			<Dialog.Description>
				{workspace.t('ui.ws.mail.template_hint', {
					placeholders: placeholders.map((placeholder) => `{${placeholder}}`).join(' '),
				})}
			</Dialog.Description>
		</Dialog.Header>
		<form id="template-form" class="space-y-3" onsubmit={save} novalidate>
			<FormField id="tp-name" label={workspace.t('ui.ws.contacts.name')} error={fields.name}>
				<Input id="tp-name" bind:value={value.name} aria-invalid={!!fields.name} />
			</FormField>
			<FormField id="tp-subject" label={workspace.t('ui.ws.mail.subject')} error={fields.subject}>
				<Input id="tp-subject" bind:value={value.subject} aria-invalid={!!fields.subject} />
			</FormField>
			<FormField id="tp-body" label={workspace.t('ui.ws.mail.message')}>
				<Textarea id="tp-body" rows={8} bind:value={value.body} />
			</FormField>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button type="submit" form="template-form">{workspace.t('ui.save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
