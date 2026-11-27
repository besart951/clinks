<script lang="ts">
	import MapLink from '#lib/components/common/MapLink.svelte';
	import MailLink from '#lib/components/common/MailLink.svelte';
	import { untrack } from 'svelte';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import {
		InlineEditor,
		maskValue,
		readGroup,
		type InlineFieldSpec,
		type InlineSave,
	} from '@clinks/ui/kit/inline-edit';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		field,
		onsave,
		onremove,
		autostart = false,
	}: { field: InlineFieldSpec; onsave: InlineSave; onremove?: () => void; autostart?: boolean } = $props();

	const workspace = useWorkspace();
	const editor = new InlineEditor(
		(value) => onsave(value),
		(value) => field.validate?.(value) ?? null,
	);
	let revealed = $state(false);
	const kind = $derived(field.kind ?? 'text');
	const shown = $derived.by(() => {
		if (kind === 'masked' && !revealed) return maskValue(field.value);
		if (kind === 'select') return field.options?.find((option) => option.value === field.value)?.label ?? field.value;
		return field.display ?? field.value;
	});
	const filled = $derived(kind === 'group' ? shown !== '' : field.value !== '');
	const groupDraft = $derived(kind === 'group' ? readGroup(editor.draft) : {});
	const partId = $props.id();

	function setPart(key: string, value: string) {
		editor.draft = JSON.stringify({ ...groupDraft, [key]: value });
	}

	/** Moving between the inputs of a group keeps editing; leaving the group saves. */
	function groupFocusOut(event: FocusEvent) {
		const group = event.currentTarget as HTMLElement;
		if (!group.contains(event.relatedTarget as Node | null)) void blurCommit();
	}

	const inputType = $derived(kind === 'masked' ? 'text' : kind === 'textarea' || kind === 'select' ? 'text' : kind);

	untrack(() => {
		if (autostart) editor.start(field.value);
	});

	function begin() {
		if (!field.readonly) editor.start(field.value);
	}

	function activate(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			begin();
		}
	}

	function focusInput(node: HTMLElement) {
		node.focus();
		if (node instanceof HTMLInputElement && node.type === 'text') node.select();
	}

	async function blurCommit() {
		if (!(await editor.commit()) && !editor.error) editor.cancel();
	}
</script>

<div
	class="reveal-scope hover:bg-accent group/attr grid min-h-8 grid-cols-[minmax(6rem,8.5rem)_minmax(0,1fr)_1.5rem] items-center gap-2 rounded-md px-1 transition-colors"
	data-revealed={editor.editing ? '' : undefined}
>
	<span class="text-muted-foreground truncate text-[13px]" title={field.label}>{field.label}</span>
	{#if editor.editing}
		<div class="min-w-0 py-0.5">
			{#if kind === 'group'}
				<div class="flex flex-wrap gap-x-1.5 gap-y-1" role="group" aria-label={field.label} onfocusout={groupFocusOut}>
					{#each field.parts ?? [] as part, index (part.key)}
						<div class="flex min-w-0 flex-col {part.narrow ? 'w-20 flex-none' : 'min-w-32 flex-[1_1_8rem]'}">
							<label for="{partId}-{part.key}" class="text-muted-foreground text-[11px]">{part.label}</label>
							<input
								id="{partId}-{part.key}"
								class="bg-field ring-ring h-7 w-full rounded-md px-1.5 text-sm ring-1 outline-none focus-visible:outline-none"
								value={groupDraft[part.key] ?? ''}
								autocomplete={part.autocomplete}
								inputmode={part.inputmode}
								aria-invalid={editor.error ? 'true' : undefined}
								oninput={(event) => setPart(part.key, event.currentTarget.value)}
								onkeydown={(event) => editor.keydown(event)}
								{@attach (node) => {
									if (index === 0) focusInput(node);
								}}
							/>
						</div>
					{/each}
				</div>
			{:else if kind === 'textarea'}
				<textarea
					class="bg-field ring-ring w-full resize-y rounded-md px-1.5 py-1 text-sm ring-1 outline-none focus-visible:outline-none"
					rows="4"
					aria-label={field.label}
					bind:value={editor.draft}
					onkeydown={(event) => editor.keydown(event, true)}
					onblur={blurCommit}
					{@attach focusInput}></textarea>
			{:else if kind === 'select'}
				<select
					class="bg-field ring-ring h-7 w-full rounded-md px-1 text-sm ring-1 outline-none focus-visible:outline-none"
					aria-label={field.label}
					bind:value={editor.draft}
					onchange={() => editor.commit()}
					onkeydown={(event) => editor.keydown(event)}
					onblur={blurCommit}
					{@attach focusInput}
				>
					{#each field.options ?? [] as option (option.value)}<option value={option.value}>
							{option.label}
						</option>{/each}
				</select>
			{:else}
				<input
					class="bg-field ring-ring h-7 w-full rounded-md px-1.5 text-sm ring-1 outline-none focus-visible:outline-none {field.mono ||
					kind === 'masked'
						? 'font-mono'
						: ''}"
					type={inputType}
					aria-label={field.label}
					aria-invalid={editor.error ? 'true' : undefined}
					bind:value={editor.draft}
					onkeydown={(event) => editor.keydown(event)}
					onblur={blurCommit}
					{@attach focusInput}
				/>
			{/if}
			{#if editor.error}<p class="text-destructive mt-1 text-xs" role="alert">{editor.error}</p>{/if}
		</div>
		<span class="text-muted-foreground grid place-items-center">
			{#if editor.saving}<LoaderCircle class="size-3.5 animate-spin" />{/if}
		</span>
	{:else}
		<span
			class="-ml-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm [overflow-wrap:anywhere] {field.readonly
				? ''
				: 'hover:bg-field cursor-text hover:shadow-[0_0_0_1px_var(--input)]'} {kind === 'select'
				? 'justify-self-start'
				: ''}"
			role="button"
			tabindex={field.readonly ? -1 : 0}
			aria-disabled={field.readonly ? 'true' : undefined}
			title={field.readonly ? undefined : workspace.t('ui.ws.inline.edit_hint')}
			onclick={begin}
			onkeydown={activate}
		>
			{#if filled}
				<span
					class="min-w-0 {field.mono || kind === 'masked' ? 'font-mono text-[13px]' : ''} {kind === 'textarea'
						? 'whitespace-pre-wrap'
						: ''}"
				>
					{shown}
				</span>
				{#if field.hint}<span class="text-muted-foreground">· {field.hint}</span>{/if}
				{#if kind === 'masked'}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded"
						aria-label={revealed ? workspace.t('ui.ws.inline.hide') : workspace.t('ui.ws.inline.show')}
						onclick={(event) => {
							event.stopPropagation();
							revealed = !revealed;
						}}
					>
						{#if revealed}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
					</button>
				{/if}
				{#if kind === 'select' && !field.readonly}<ChevronDown class="text-muted-foreground size-3.5" />{/if}
			{:else}
				<span class="text-muted-foreground">{workspace.t('ui.ws.inline.empty')}</span>
			{/if}
		</span>
		{#if onremove && field.removable && !field.readonly}
			<button
				type="button"
				class="reveal text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded"
				aria-label={workspace.t('ui.ws.inline.remove', { field: field.label })}
				onclick={onremove}
			>
				<X class="size-3.5" />
			</button>
		{:else if field.place}
			<!-- Beside the value, not inside it: the value is itself a button that starts editing. -->
			<MapLink place={field.place} />
		{:else if field.mail}
			<MailLink address={field.mail} />
		{:else}<span></span>{/if}
	{/if}
</div>
