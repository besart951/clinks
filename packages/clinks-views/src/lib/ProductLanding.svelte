<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useAuth } from '@clinks/auth';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import Layers3 from '@lucide/svelte/icons/layers-3';
	import Network from '@lucide/svelte/icons/network';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ProductHeader from './ProductHeader.svelte';

	let { application }: { application: ApplicationScope } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
</script>

<svelte:head>
	<title>{t(`ui.landing_meta_title_${application}`)}</title>
	<meta name="description" content={t(`ui.landing_description_${application}`)} />
</svelte:head>

<main class="bg-background text-foreground min-h-screen overflow-hidden">
	<div class="relative border-b">
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,color-mix(in_oklab,var(--primary)_13%,transparent),transparent_30%),radial-gradient(circle_at_86%_12%,color-mix(in_oklab,var(--muted-foreground)_10%,transparent),transparent_24%)]"
		></div>
		<div class="relative">
			<ProductHeader {application} />
			<section
				class="mx-auto grid max-w-7xl gap-14 px-5 pt-20 pb-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-28 lg:pb-32"
			>
				<div>
					<Badge variant="secondary" class="mb-6 rounded-full px-3 py-1">{t(`ui.landing_eyebrow_${application}`)}</Badge
					>
					<h1 class="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
						{t(`ui.landing_title_${application}`)}
					</h1>
					<p class="text-muted-foreground mt-7 max-w-2xl text-lg leading-8 sm:text-xl">
						{t(`ui.landing_description_${application}`)}
					</p>
					<div class="mt-9 flex flex-wrap gap-3">
						{#if auth.status === 'authenticated'}
							<Button href="/dashboard" size="lg">{t('ui.open_dashboard')}<ArrowRight data-icon="inline-end" /></Button>
						{:else if auth.status === 'anonymous'}
							<Button href="/signup" size="lg">{t('ui.get_started')}<ArrowRight data-icon="inline-end" /></Button>
							<Button href="/login" size="lg" variant="outline">{t('ui.sign_in')}</Button>
						{:else if auth.status === 'error'}
							<Button size="lg" variant="outline" onclick={() => void auth.refresh()}>{t('ui.retry_session')}</Button>
						{:else}
							<Button size="lg" disabled>{t('ui.checking_session')}</Button>
						{/if}
					</div>
					{#if auth.status === 'error'}
						<p class="text-muted-foreground mt-4 text-sm" role="status">{t('ui.session_unavailable')}</p>
					{/if}
				</div>
				<div class="relative mx-auto w-full max-w-lg">
					<div class="bg-muted/50 absolute -inset-5 -rotate-2 rounded-[2.25rem] border"></div>
					<Card.Root class="relative rounded-[2rem] p-3 shadow-2xl shadow-black/10">
						<Card.Content class="grid gap-3 p-3 sm:grid-cols-2">
							<div class="bg-foreground text-background col-span-full rounded-2xl p-6">
								<p class="text-background/65 text-sm">{t('ui.active_tenant')}</p>
								<p class="mt-3 text-2xl font-medium">{t(`ui.landing_preview_tenant_${application}`)}</p>
							</div>
							<div class="bg-muted rounded-2xl p-5">
								<p class="text-muted-foreground text-sm">{t('ui.dashboard')}</p>
								<div class="mt-8 h-2 rounded-full bg-current opacity-20"></div>
								<div class="mt-2 h-2 w-2/3 rounded-full bg-current opacity-10"></div>
							</div>
							<div class="rounded-2xl border p-5">
								<ShieldCheck class="size-6" />
								<p class="mt-8 text-sm font-medium">{t('ui.permission_aware')}</p>
							</div>
						</Card.Content>
					</Card.Root>
				</div>
			</section>
		</div>
	</div>

	<section class="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
		<div class="mb-12 max-w-2xl">
			<p class="text-muted-foreground text-sm font-medium tracking-[0.18em] uppercase">{t('ui.landing_foundation')}</p>
			<h2 class="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
				{t(`ui.landing_features_title_${application}`)}
			</h2>
		</div>
		<div class="grid gap-4 md:grid-cols-3">
			{#each ['first', 'second', 'third'] as feature, index (feature)}
				<Card.Root class="rounded-2xl">
					<Card.Header>
						<div class="bg-muted mb-4 grid size-11 place-items-center rounded-xl">
							{#if index === 0}<CalendarRange class="size-5" />{:else if index === 1}<Layers3
									class="size-5"
								/>{:else}<Network class="size-5" />{/if}
						</div>
						<Card.Title>{t(`ui.landing_feature_${feature}_title_${application}`)}</Card.Title>
						<Card.Description class="leading-6"
							>{t(`ui.landing_feature_${feature}_description_${application}`)}</Card.Description
						>
					</Card.Header>
				</Card.Root>
			{/each}
		</div>
	</section>
</main>
