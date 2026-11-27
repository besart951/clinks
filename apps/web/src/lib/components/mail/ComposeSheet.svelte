<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Send from '@lucide/svelte/icons/send';
	import FileText from '@lucide/svelte/icons/file-text';
	import * as Sheet from '@clinks/ui/components/ui/sheet';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import AttachmentPicker from './AttachmentPicker.svelte';
	import { ComposeModel } from '#lib/features/mail/compose.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact, MailTemplate } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { contacts, templates, onClose }: { contacts: Contact[]; templates: MailTemplate[]; onClose?: () => void } =
		$props();
	const workspace = useWorkspace();
	const form = new ComposeModel(workspace, () => (open = true));
	let open = $state(false);
	let confirm = $state<ConfirmRequest | null>(null);
	const suggestions = $derived(
		form.recipientInput.length < 2
			? []
			: contacts
					.filter(
						(contact) =>
							contact.email &&
							!form.to.includes(contact.email) &&
							`${contactName(contact)} ${contact.email}`.toLowerCase().includes(form.recipientInput.toLowerCase()),
					)
					.slice(0, 6),
	);

	export function show(options: Parameters<ComposeModel['start']>[0] = {}) {
		form.start(options);
		open = true;
	}

	function finish() {
		open = false;
		onClose?.();
	}

	const user = $derived(workspace.session.user);
	/** «''» stands for the platform address in the caller's name (Select needs a string). */
	const senderOptions = $derived([
		...form.senders.map((sender) => ({
			value: sender.id,
			label: sender.active
				? `${sender.displayName} <${sender.address}>`
				: workspace.t('ui.ws.mail.sender_pending', { address: sender.address }),
		})),
		...(form.senders.some((sender) => sender.kind === 'personal')
			? []
			: [
					{
						value: '',
						label: workspace.t('ui.ws.mail.sender_platform', {
							name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
							email: user?.email ?? '',
						}),
					},
				]),
	]);

	function close(next: boolean) {
		if (next) return;
		if (!form.dirty) return finish();
		confirm = {
			title: workspace.t('ui.ws.mail.discard_title'),
			description: workspace.t('ui.ws.mail.discard_text'),
			confirmLabel: workspace.t('ui.ws.mail.save_draft'),
			onConfirm: async () => {
				if (await form.saveDraft(contacts)) finish();
			},
		};
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (await form.send()) finish();
	}

	function onRecipientKey(event: KeyboardEvent) {
		if (['Enter', ',', ';'].includes(event.key)) {
			event.preventDefault();
			form.addRecipient();
		} else if (event.key === 'Backspace' && !form.recipientInput && form.to.length > 0) {
			form.removeRecipient(form.to[form.to.length - 1]);
		}
	}
</script>

<Sheet.Root {open} onOpenChange={close}>
	<Sheet.Content closeLabel={workspace.t('ui.ws.close')} class="w-full overflow-y-auto sm:max-w-2xl">
		<Sheet.Header>
			<Sheet.Title>
				{form.replyTo ? workspace.t('ui.ws.mail.reply') : workspace.t('ui.ws.command.new_mail')}
			</Sheet.Title>
			<Sheet.Description>{workspace.t('ui.ws.mail.compose_text')}</Sheet.Description>
		</Sheet.Header>
		<form id="compose-form" class="space-y-4 px-4" onsubmit={send} novalidate>
			{#if senderOptions.length > 1}
				<FormField id="m-from" label={workspace.t('ui.ws.mail.sender')}>
					<Choice
						id="m-from"
						label={workspace.t('ui.ws.mail.sender')}
						bind:value={() => form.senderId ?? '', (next) => (form.senderId = next || null)}
						options={senderOptions}
					/>
				</FormField>
			{/if}
			<FormField
				id="m-to"
				label={workspace.t('ui.ws.mail.to')}
				error={form.fields.to ?? Object.entries(form.fields).find(([key]) => key.startsWith('to.'))?.[1]}
			>
				<div class="relative">
					<div
						class="border-input focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1 focus-within:ring-3"
					>
						{#each form.to as email (email)}
							<span class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
								{email}<button
									type="button"
									class="rounded-full p-0.5 hover:bg-background"
									onclick={() => form.removeRecipient(email)}
									aria-label={workspace.t('ui.ws.contacts.remove_tag', { tag: email })}
								>
									<X class="size-3" />
								</button>
							</span>
						{/each}
						<input
							id="m-to"
							class="min-w-32 flex-1 bg-transparent text-sm outline-none"
							bind:value={form.recipientInput}
							onkeydown={onRecipientKey}
							onblur={() => form.recipientInput.includes('@') && form.addRecipient()}
							autocomplete="off"
						/>
					</div>
					{#if suggestions.length > 0}
						<ul class="bg-popover absolute top-full z-10 mt-1 w-full rounded-lg border p-1 shadow-md">
							{#each suggestions as contact (contact.id)}
								<li>
									<button
										type="button"
										class="hover:bg-muted flex w-full justify-between gap-2 rounded-md px-2 py-1 text-left text-sm"
										onmousedown={(event) => {
											event.preventDefault();
											form.addRecipient(contact.email);
										}}
									>
										<span>{contactName(contact)}</span><span class="text-muted-foreground">{contact.email}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</FormField>
			<FormField id="m-subject" label={workspace.t('ui.ws.mail.subject')} error={form.fields.subject}>
				<Input id="m-subject" bind:value={form.subject} aria-invalid={!!form.fields.subject} />
			</FormField>
			<FormField id="m-body" label={workspace.t('ui.ws.mail.message')}>
				<Textarea id="m-body" rows={14} bind:value={form.body} />
			</FormField>
			{#if form.usesPlaceholders}
				<p class="text-muted-foreground text-xs" data-testid="placeholder-hint">
					{workspace.t('ui.ws.mail.placeholder_hint', { example: '{vorname}' })}
				</p>
			{/if}
			<AttachmentPicker
				attached={form.attachments}
				onattach={(document) => form.attach(document)}
				ondetach={(document) => form.detach(document)}
			/>
		</form>
		<Sheet.Footer class="flex-row flex-wrap items-center">
			{#if templates.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}<Button
								{...props}
								variant="ghost"
								class="mr-auto"
								title={workspace.t('ui.ws.mail.templates')}
							>
								<FileText class="size-4" /><span class="max-sm:sr-only">{workspace.t('ui.ws.mail.templates')}</span>
							</Button>{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						{#each templates as template (template.id)}<DropdownMenu.Item onclick={() => form.applyTemplate(template)}>
								{template.name}
							</DropdownMenu.Item>{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			<Button variant="outline" disabled={form.busy} onclick={async () => (await form.saveDraft(contacts)) && finish()}>
				{workspace.t('ui.ws.mail.save_draft')}
			</Button>
			<Button type="submit" form="compose-form" disabled={form.busy}>
				<Send class="size-4" />{workspace.t('ui.ws.mail.send')}
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
<ConfirmDialog bind:request={confirm} />
