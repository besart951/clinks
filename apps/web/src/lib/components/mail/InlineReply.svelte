<script lang="ts">
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Send from '@lucide/svelte/icons/send';
	import { onMount } from 'svelte';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import type { MailMessage } from '@clinks/domain/types';
	import { ComposeModel } from '#lib/features/mail/compose.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * Answering right under the conversation, without a panel. `to` is who the answer goes to: the other side
	 * of the conversation. «Im Fenster» continues in the full form with what is written so far.
	 */
	let {
		mail,
		to,
		expand,
	}: {
		mail: MailMessage;
		to: string[];
		expand: (options: { replyTo: MailMessage; to: string[]; body: string }) => void;
	} = $props();
	const workspace = useWorkspace();
	const form = new ComposeModel(workspace);
	let field = $state<HTMLTextAreaElement | null>(null);

	onMount(() => form.start({ replyTo: mail, to, body: '' }));

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (await form.send()) form.start({ replyTo: mail, to, body: '' });
	}
</script>

<form class="bg-muted/30 space-y-2 rounded-lg border p-3" onsubmit={send} aria-label={workspace.t('ui.ws.mail.reply')}>
	<label for="inline-reply" class="text-muted-foreground block text-xs">
		{workspace.t('ui.ws.mail.reply_to', { to: to.join(', ') })}
	</label>
	<Textarea
		id="inline-reply"
		bind:ref={field}
		bind:value={form.body}
		rows={form.body ? 6 : 2}
		placeholder={workspace.t('ui.ws.mail.reply_placeholder')}
		onkeydown={(event) => {
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				field?.form?.requestSubmit();
			}
		}}
	/>
	<div class="flex items-center gap-2">
		<Button type="submit" size="sm" disabled={form.busy || !form.body.trim()} aria-keyshortcuts="Control+Enter">
			<Send class="size-4" />{workspace.t('ui.ws.mail.send')}
		</Button>
		<Button type="button" variant="ghost" size="sm" onclick={() => expand({ replyTo: mail, to, body: form.body })}>
			<Maximize2 class="size-4" />{workspace.t('ui.ws.mail.reply_expand')}
		</Button>
		<span class="text-muted-foreground ms-auto hidden text-xs sm:inline">{workspace.t('ui.ws.mail.reply_hint')}</span>
	</div>
</form>
