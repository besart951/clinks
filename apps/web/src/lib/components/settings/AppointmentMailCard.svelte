<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import { AppointmentMailModel } from '#lib/features/settings/appointment-mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Settings › E-Mail › Termine. The mails name workspace, date, time and address only, never the treatment. */
	const workspace = useWorkspace();
	const model = new AppointmentMailModel(workspace);
	onMount(() => void model.load());

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.save();
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title><h2>{workspace.t('ui.ws.appointment_mail.title')}</h2></Card.Title>
		<Card.Description>{workspace.t('ui.ws.appointment_mail.text')}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="space-y-4" onsubmit={submit}>
			<label class="flex items-start gap-3 text-sm">
				<Switch bind:checked={model.value.confirmation} class="mt-0.5" />
				<span>
					{workspace.t('ui.ws.appointment_mail.confirmation')}
					<span class="text-muted-foreground block text-xs">
						{workspace.t('ui.ws.appointment_mail.confirmation_hint')}
					</span>
				</span>
			</label>
			<div class="flex flex-wrap items-start gap-3">
				<label class="flex flex-1 items-start gap-3 text-sm">
					<Switch bind:checked={model.value.reminder} class="mt-0.5" />
					<span>{workspace.t('ui.ws.appointment_mail.reminder')}</span>
				</label>
				<FormField id="am-hours" label={workspace.t('ui.ws.appointment_mail.hours')} error={model.fields.hoursBefore}>
					<Input
						id="am-hours"
						type="number"
						inputmode="numeric"
						min={1}
						max={168}
						class="w-24"
						disabled={!model.value.reminder}
						bind:value={model.value.hoursBefore}
					/>
				</FormField>
			</div>
			{#if workspace.session.hasModule('spitex')}
				<label class="flex items-start gap-3 text-sm">
					<Switch bind:checked={model.value.spitexVisits} class="mt-0.5" />
					<span>
						{workspace.t('ui.ws.appointment_mail.spitex')}
						<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.appointment_mail.spitex_hint')}</span>
					</span>
				</label>
			{/if}
			<FormField
				id="am-text"
				label={workspace.t('ui.ws.appointment_mail.own_text')}
				hint={workspace.t('ui.ws.appointment_mail.own_text_hint')}
				error={model.fields.text}
			>
				<Textarea id="am-text" rows={2} maxlength={500} bind:value={model.value.text} />
			</FormField>
			<fieldset class="space-y-1 text-sm">
				<legend class="font-medium">{workspace.t('ui.ws.appointment_mail.channel')}</legend>
				<label class="flex items-center gap-2">
					<input type="radio" name="am-channel" checked disabled />
					{workspace.t('ui.email')}
				</label>
				<label class="text-muted-foreground flex items-center gap-2">
					<input type="radio" name="am-channel" disabled />
					{workspace.t('ui.ws.appointment_mail.sms_soon')}
				</label>
			</fieldset>
			<p class="text-muted-foreground text-xs">
				{workspace.t('ui.ws.appointment_mail.privacy')}
			</p>
			<Button type="submit" disabled={model.busy || !model.dirty}>{workspace.t('ui.save')}</Button>
		</form>
	</Card.Content>
</Card.Root>
