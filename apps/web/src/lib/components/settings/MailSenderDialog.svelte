<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { Label } from '@clinks/ui/components/ui/label';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import type { Member } from '#lib/data/account-api';
	import type { MailSettingsModel } from '#lib/features/settings/mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model, members }: { model: MailSettingsModel; members: Member[] } = $props();
	const workspace = useWorkspace();

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.saveSender();
	}
</script>

<Dialog.Root bind:open={() => model.draft !== null, (open) => !open && (model.draft = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		{#if model.draft}
			{@const draft = model.draft}
			<Dialog.Header>
				<Dialog.Title>{workspace.t(`ui.ws.mail_settings.sender_${draft.kind}`)}</Dialog.Title>
				<Dialog.Description>{workspace.t(`ui.ws.mail_settings.sender_${draft.kind}_text`)}</Dialog.Description>
			</Dialog.Header>
			<form id="mail-sender" class="space-y-4" onsubmit={submit} novalidate>
				<FormField id="ms-address" label={workspace.t('ui.ws.mail_settings.address')} error={model.draftErrors.address}>
					<Input id="ms-address" type="email" autocomplete="off" required bind:value={draft.address} />
				</FormField>
				<FormField id="ms-name" label={workspace.t('ui.ws.mail_settings.display_name')}>
					<Input id="ms-name" required bind:value={draft.displayName} />
				</FormField>
				<FormField
					id="ms-reply"
					label={workspace.t('ui.ws.mail_settings.reply_to')}
					hint={workspace.t('ui.ws.mail_settings.reply_to_hint')}
					error={model.draftErrors.replyTo}
				>
					<Input
						id="ms-reply"
						type="email"
						bind:value={() => draft.replyTo ?? '', (value) => (draft.replyTo = value)}
					/>
				</FormField>
				{#if draft.kind === 'personal'}
					<FormField id="ms-user" label={workspace.t('ui.ws.mail_settings.person')} error={model.draftErrors.userId}>
						<Choice
							id="ms-user"
							bind:value={() => draft.userId ?? '', (value) => (draft.userId = value || null)}
							options={members.map(({ user }) => ({ value: user.id, label: `${user.firstName} ${user.lastName}` }))}
						/>
					</FormField>
				{:else}
					<FormField id="ms-signature" label={workspace.t('ui.ws.mail_settings.signature')}>
						<Textarea id="ms-signature" rows={3} maxlength={1000} bind:value={draft.signature} />
					</FormField>
					<div class="flex items-center justify-between gap-4">
						<Label for="ms-default">{workspace.t(`ui.ws.mail_settings.default_${draft.kind}`)}</Label>
						<Switch id="ms-default" bind:checked={draft.isDefault} />
					</div>
				{/if}
			</form>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (model.draft = null)}>{workspace.t('ui.ws.cancel')}</Button>
				<Button type="submit" form="mail-sender" disabled={model.busy}>{workspace.t('ui.save')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
