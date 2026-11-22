<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { Resource } from '#lib/state/resource.svelte';
	import ErrorState from './ErrorState.svelte';
	import Forbidden from './Forbidden.svelte';
	import SkeletonRows from './SkeletonRows.svelte';

	let {
		resource,
		skeleton = 'list',
		isEmpty = () => false,
		empty,
		children,
	}: {
		resource: Resource<T>;
		skeleton?: 'list' | 'cards' | 'detail';
		isEmpty?: (data: T) => boolean;
		empty?: Snippet;
		children: Snippet<[T]>;
	} = $props();
</script>

{#if resource.status === 'loading'}
	<SkeletonRows variant={skeleton} />
{:else if resource.status === 'forbidden'}
	<Forbidden />
{:else if resource.status === 'error'}
	<ErrorState message={resource.error} onRetry={() => void resource.reload()} />
{:else if empty && isEmpty(resource.value)}
	{@render empty()}
{:else}
	{@render children(resource.value)}
{/if}
