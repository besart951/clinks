<script lang="ts">
	import Mail from '@lucide/svelte/icons/mail';
	import { useWriteMail } from '#lib/features/mail/write-mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** A small icon beside an address that writes to it, in CLinks or the device's mail program (like `MapLink`). */
	let { address, class: className = '' }: { address: string; class?: string } = $props();
	const workspace = useWorkspace();
	const writeMail = useWriteMail();
	const label = $derived(workspace.t('ui.ws.write_mail.to', { email: address }));
</script>

<button
	type="button"
	class="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-grid size-6 shrink-0 place-items-center rounded-md align-middle focus-visible:ring-2 focus-visible:outline-none {className}"
	aria-label={label}
	title={label}
	onclick={(event) => {
		event.stopPropagation();
		writeMail.write(address);
	}}
>
	<Mail class="size-3.5" />
</button>
