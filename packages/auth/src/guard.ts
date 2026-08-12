import type { Snippet } from 'svelte';

export interface GuardFeedback {
	loading?: Snippet;
	error?: Snippet;
	fallback?: Snippet;
}
