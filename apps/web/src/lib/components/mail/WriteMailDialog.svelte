<script lang="ts">
	import Mail from '@lucide/svelte/icons/mail';
	import AppWindow from '@lucide/svelte/icons/app-window';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import type { WriteMail } from '#lib/features/mail/write-mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Asks which program writes the mail; lives once in the app shell. */
	let { model }: { model: WriteMail } = $props();
	const workspace = useWorkspace();
</script>

<Dialog.Root bind:open={() => model.asking !== null, (open) => !open && (model.asking = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.write_mail.title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.write_mail.text', { email: model.asking ?? '' })}</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-2">
			<Button class="h-auto justify-start py-3 text-left" onclick={() => model.choose('clinks')}>
				<Mail class="size-5 shrink-0" />
				<span>
					{workspace.t('ui.ws.write_mail.clinks')}
					<span class="block text-xs font-normal opacity-80">{workspace.t('ui.ws.write_mail.clinks_hint')}</span>
				</span>
			</Button>
			<Button variant="outline" class="h-auto justify-start py-3 text-left" onclick={() => model.choose('system')}>
				<AppWindow class="size-5 shrink-0" />
				<span>
					{workspace.t('ui.ws.write_mail.system')}
					<span class="text-muted-foreground block text-xs font-normal">
						{workspace.t('ui.ws.write_mail.system_hint')}
					</span>
				</span>
			</Button>
		</div>
		<label class="flex items-start gap-2 text-sm">
			<Checkbox bind:checked={model.remember} class="mt-0.5" />
			<span>
				{workspace.t('ui.ws.write_mail.remember')}
				<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.write_mail.remember_hint')}</span>
			</span>
		</label>
	</Dialog.Content>
</Dialog.Root>
