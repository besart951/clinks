<script lang="ts">
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Separator } from '@clinks/ui-shared/components/ui/separator';
	import { FileSearch, Lock, AlertTriangle, RefreshCw, Home } from '@lucide/svelte';
	import { useClinksRuntime } from '@clinks/clinks-runtime';

	interface Props {
		status?: number;
		message?: string;
		title?: string;
		onRetry?: () => void;
	}

	let { status = 404, message = '', title = '', onRetry }: Props = $props();

	let runtime = $derived.by(() => {
		try {
			return useClinksRuntime();
		} catch {
			return null;
		}
	});

	function t(key: string, fallback: string): string {
		if (runtime?.translationBundle) {
			return runtime.translationBundle.t(key, fallback);
		}
		return fallback;
	}

	let displayTitle = $derived.by(() => {
		if (title) return title;
		if (status === 404) return t('ui.error_not_found_title', 'Page Not Found');
		if (status === 403) return t('ui.error_forbidden_title', 'Access Denied');
		if (status >= 500) return t('ui.error_server_title', 'Server Error');
		return t('ui.error_generic_title', 'Unexpected Error');
	});

	let displayDescription = $derived.by(() => {
		if (message) return message;
		if (status === 404)
			return t('ui.error_not_found_desc', 'The page you are looking for does not exist or has been moved.');
		if (status === 403) return t('ui.error_forbidden_desc', 'You do not have permission to access this area.');
		if (status >= 500)
			return t('ui.error_server_desc', 'An internal server error occurred while processing the request.');
		return t('ui.error_generic_desc', 'An unexpected error occurred. Please try again.');
	});

	let displayHomeLabel = $derived(t('ui.back_to_home', 'Back to Home'));
	let displayRetryLabel = $derived(t('ui.try_again', 'Try Again'));
</script>

<div class="relative flex min-h-[80vh] w-full flex-col items-center justify-center p-6 text-center">
	<!-- Ambient Background Glow -->
	<div class="absolute -z-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl"></div>

	<!-- Shadcn Card Component -->
	<Card.Root class="w-full max-w-lg border-border/40 bg-background/70 shadow-2xl backdrop-blur-xl">
		<Card.Header class="items-center text-center pb-2">
			<!-- Status Badge Component -->
			<Badge variant="destructive" class="mb-4 text-xs font-semibold uppercase tracking-wider px-3 py-1">
				{t('ui.status_code', 'Status {code}').replace('{code}', String(status))}
			</Badge>

			<!-- Dynamic Lucide Icon -->
			<div
				class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/60 text-foreground shadow-inner"
			>
				{#if status === 404}
					<FileSearch class="h-10 w-10 text-muted-foreground" />
				{:else if status === 403}
					<Lock class="h-10 w-10 text-amber-500" />
				{:else}
					<AlertTriangle class="h-10 w-10 text-destructive" />
				{/if}
			</div>

			<Card.Title class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
				{displayTitle}
			</Card.Title>
			<Card.Description class="mt-2 text-base text-muted-foreground">
				{displayDescription}
			</Card.Description>
		</Card.Header>

		<Card.Content class="pt-4">
			<Separator class="my-2" />
		</Card.Content>

		<Card.Footer class="flex flex-col gap-3 sm:flex-row sm:justify-center pt-2 pb-6">
			{#if onRetry}
				<Button onclick={onRetry} variant="default" class="w-full sm:w-auto gap-2">
					<RefreshCw class="h-4 w-4" />
					{displayRetryLabel}
				</Button>
			{/if}

			<Button href="/" variant="outline" class="w-full sm:w-auto gap-2">
				<Home class="h-4 w-4" />
				{displayHomeLabel}
			</Button>
		</Card.Footer>
	</Card.Root>
</div>
