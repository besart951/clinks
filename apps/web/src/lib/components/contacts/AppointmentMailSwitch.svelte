<script lang="ts">
	import { Switch } from '@clinks/ui/components/ui/switch';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import type { Contact } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Whether this contact gets appointment confirmations and reminders (when the workspace sends them). */
	let { contact }: { contact: Contact } = $props();
	const workspace = useWorkspace();
	let busy = $state(false);

	async function toggle(on: boolean) {
		busy = true;
		await workspace.run(() => workspace.api.contacts.update(contact.id, contact.revision, { reminders: on }), {
			success: on ? 'ui.ws.appointment_mail.contact_on' : 'ui.ws.appointment_mail.contact_off',
		});
		busy = false;
	}
</script>

<SideCard card={{ title: workspace.t('ui.ws.appointment_mail.contact_title') }}>
	<label class="flex items-start gap-3 text-[13px]">
		<Switch
			checked={contact.reminders !== false}
			disabled={busy || !contact.email || !workspace.session.can('contacts.write')}
			onCheckedChange={toggle}
			class="mt-0.5"
		/>
		<span>
			{workspace.t('ui.ws.appointment_mail.contact_switch')}
			<span class="text-muted-foreground block">
				{contact.email
					? workspace.t('ui.ws.appointment_mail.contact_hint')
					: workspace.t('ui.ws.appointment_mail.contact_no_email')}
			</span>
		</span>
	</label>
</SideCard>
