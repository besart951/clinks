<script lang="ts">
	import { onMount } from 'svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import PersonAvatar from '$lib/components/common/PersonAvatar.svelte';
	import { CommentThreadModel } from '$lib/features/collaboration/comments.svelte';
	import type { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import type { CommentTarget } from '$lib/domain/types';
	import { useWorkspace } from '$lib/workspace.svelte';

	let {
		target,
		context,
		people,
	}: { target: CommentTarget; context: { label: string; path: string }; people: PeopleDirectory } = $props();
	const workspace = useWorkspace();
	// svelte-ignore state_referenced_locally
	const model = new CommentThreadModel(workspace, target, context);
	let mentionQuery = $state<string | null>(null);
	let textarea = $state<HTMLTextAreaElement | null>(null);
	const suggestions = $derived(
		mentionQuery === null
			? []
			: people.people.filter((person) => person.name.toLowerCase().includes(mentionQuery!.toLowerCase())).slice(0, 5),
	);

	onMount(() => model.resource.connect());

	function onInput() {
		const value = model.draft.slice(0, textarea?.selectionStart ?? model.draft.length);
		const match = value.match(/@([\p{L} ]{0,20})$/u);
		mentionQuery = match ? match[1] : null;
	}

	function insertMention(name: string) {
		model.draft = model.draft.replace(/@([\p{L} ]{0,20})$/u, `@${name} `);
		mentionQuery = null;
		textarea?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void model.post(people.people);
		if (event.key === 'Escape') mentionQuery = null;
	}

	function render(body: string) {
		return body.split(/(@[\p{L}]+ [\p{L}]+)/u);
	}
</script>

<section class="space-y-4" aria-label={workspace.t('ui.ws.comments.title')}>
	<ul class="space-y-3">
		{#each model.resource.data ?? [] as comment (comment.id)}
			{@const author = people.get(comment.authorId)}
			<li class="group flex gap-3">
				<PersonAvatar person={author ?? { name: '?', avatarColor: '#71717a' }} size="sm" />
				<div class="bg-muted/60 min-w-0 flex-1 rounded-lg px-3 py-2 text-sm">
					<p class="mb-0.5 flex items-center gap-2 text-xs">
						<span class="font-medium">{author?.name ?? '?'}</span>
						<span class="text-muted-foreground">{workspace.i18n.relative(comment.createdAt)}</span>
						{#if comment.authorId === workspace.session.user?.id}
							<button
								class="text-muted-foreground hover:text-destructive ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
								onclick={() => model.remove(comment)}
								aria-label={workspace.t('ui.ws.comments.delete')}><Trash2 class="size-3.5" /></button
							>
						{/if}
					</p>
					<p class="whitespace-pre-wrap">
						{#each render(comment.body) as part, index (index)}
							{#if part.startsWith('@') && people.people.some((person) => `@${person.name}` === part)}<span
									class="font-medium text-sky-700 dark:text-sky-300">{part}</span
								>{:else}{part}{/if}
						{/each}
					</p>
				</div>
			</li>
		{:else}
			<li class="text-muted-foreground text-sm">{workspace.t('ui.ws.comments.empty')}</li>
		{/each}
	</ul>
	<div class="relative space-y-2">
		<Textarea
			bind:ref={textarea}
			bind:value={model.draft}
			rows={3}
			oninput={onInput}
			onkeydown={onKeydown}
			placeholder={workspace.t('ui.ws.comments.placeholder')}
			aria-label={workspace.t('ui.ws.comments.new')}
		/>
		{#if suggestions.length > 0}
			<ul
				class="bg-popover absolute bottom-full left-0 z-10 mb-1 w-64 rounded-lg border p-1 shadow-md"
				role="listbox"
				aria-label={workspace.t('ui.ws.comments.mention')}
			>
				{#each suggestions as person (person.id)}
					<li>
						<button
							type="button"
							class="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
							onclick={() => insertMention(person.name)}
						>
							<PersonAvatar {person} size="xs" />{person.name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="flex items-center justify-between">
			<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.comments.hint')}</p>
			<Button size="sm" disabled={model.busy || !model.draft.trim()} onclick={() => model.post(people.people)}
				>{workspace.t('ui.ws.comments.post')}</Button
			>
		</div>
	</div>
</section>
