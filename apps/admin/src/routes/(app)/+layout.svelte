<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, type Snippet } from 'svelte';
	import { AdminDashboardViewModel, useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { SidebarProvider, SidebarTrigger, SidebarInset } from '@clinks/ui-shared/components/ui/sidebar';
	import AdminSidebar from '$lib/AdminSidebar.svelte';
	import { page } from '$app/state';
	import { setAdminModel } from '$lib/admin-context.svelte.js';

	let { children }: { children: Snippet } = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);

	const model = new AdminDashboardViewModel(
		runtime.client,
		runtime.session,
		runtime.translations,
		runtime.translations.refresh,
		() => runtime.translations.locale,
	);
	setAdminModel(model);

	let activeSection = $state('dashboard');

	async function navigate(section: string) {
		activeSection = section;
		await model.loadSection(section);
		void goto(`/${section}`);
	}

	async function signOut() {
		await runtime.session.logout();
		void goto('/');
	}

	onMount(async () => {
		await runtime.session.hydrate();
		if (!runtime.session.isSuperAdmin) {
			void goto('/');
			return;
		}
		const path = page.url.pathname.replace(/^\//, '') || 'dashboard';
		activeSection = path;
		void model.loadSection(path);
	});
</script>

<svelte:head><title>Clinks Admin</title></svelte:head>

<SidebarProvider>
	<AdminSidebar {activeSection} onNavigate={navigate} />
	<SidebarInset>
		<div class="flex items-center gap-4 border-b px-4 py-3">
			<SidebarTrigger />
			<Badge variant="secondary">{t('ui.super_administrator')}</Badge>
			<span class="text-sm font-medium">{model.sessionEmail}</span>
			<div class="flex-1"></div>
			<Button type="button" variant="outline" size="sm" onclick={signOut}>{t('ui.sign_out')}</Button>
		</div>
		<main class="p-6">
			{#if model.errorMessage}
				<Alert.Root class="mb-6" variant="destructive" aria-live="polite">
					<Alert.Description>{model.errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}
			{@render children()}
		</main>
	</SidebarInset>
</SidebarProvider>
