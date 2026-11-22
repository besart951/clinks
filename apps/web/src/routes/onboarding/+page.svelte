<script lang="ts">
	import { onMount } from 'svelte';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import House from '@lucide/svelte/icons/house';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Check from '@lucide/svelte/icons/check';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { Label } from '@clinks/ui/components/ui/label';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import { OnboardingModel, onboardingSteps } from '#lib/features/auth/onboarding.svelte';
	import { landingPath } from '#lib/features/auth/auth-forms.svelte';
	import type { Industry } from '@clinks/domain/types';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new OnboardingModel(workspace);
	const industries: { value: Industry; icon: typeof HeartPulse }[] = [
		{ value: 'physio', icon: HeartPulse },
		{ value: 'spitex', icon: House },
		{ value: 'services', icon: Briefcase },
	];

	onMount(async () => {
		await workspace.session.ready;
		if (workspace.session.status !== 'authenticated') await navigate(landingPath(workspace.session), { replace: true });
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (model.step === 'finish') void finish();
		else model.next();
	}

	async function finish() {
		if (await model.finish()) await navigate('/dashboard');
	}
</script>

<AuthShell
	title={workspace.t(`ui.ws.onboarding.title_${model.step}`)}
	description={workspace.t('ui.ws.onboarding.step', { current: model.index + 1, total: onboardingSteps.length })}
>
	<ol class="flex gap-1" aria-hidden="true">
		{#each onboardingSteps as step, index (step)}<li
				class="h-1 flex-1 rounded-full {index <= model.index ? 'bg-primary' : 'bg-muted'}"
			></li>{/each}
	</ol>
	<form class="space-y-4" onsubmit={submit} novalidate>
		{#if model.error}<Alert.Root variant="destructive">
				<Alert.Description>{model.error}</Alert.Description>
			</Alert.Root>{/if}
		{#if model.step === 'company'}
			<FormField id="ob-company" label={workspace.t('ui.tenant_name')} hint={workspace.t('ui.tenant_name_help')}>
				<Input id="ob-company" bind:value={model.companyName} autofocus />
			</FormField>
		{:else if model.step === 'industry'}
			<fieldset class="grid gap-2">
				<legend class="sr-only">{workspace.t('ui.ws.onboarding.title_industry')}</legend>
				{#each industries as industry (industry.value)}
					<button
						type="button"
						class="flex items-center gap-3 rounded-xl border p-3 text-left text-sm aria-pressed:border-foreground aria-pressed:bg-muted"
						aria-pressed={model.industry === industry.value}
						onclick={() => model.chooseIndustry(industry.value)}
					>
						<industry.icon class="size-5" />
						<span>
							<span class="block font-medium">{workspace.t(`ui.ws.onboarding.industry_${industry.value}`)}</span><span
								class="text-muted-foreground"
							>
								{workspace.t(`ui.ws.onboarding.industry_${industry.value}_text`)}
							</span>
						</span>
					</button>
				{/each}
			</fieldset>
		{:else if model.step === 'modules'}
			<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.onboarding.modules_text')}</p>
			<ul class="grid gap-2 sm:grid-cols-2">
				{#each model.optionalModules as module (module)}
					<li>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm aria-pressed:border-foreground aria-pressed:bg-muted"
							aria-pressed={model.modules.includes(module)}
							onclick={() => model.toggleModule(module)}
						>
							{#if model.modules.includes(module)}<Check class="size-4" />{:else}<span class="size-4"
								></span>{/if}{workspace.t(`ui.ws.module.${module}`)}
						</button>
					</li>
				{/each}
			</ul>
		{:else if model.step === 'team'}
			<FormField
				id="ob-invites"
				label={workspace.t('ui.ws.onboarding.invites')}
				hint={workspace.t('ui.ws.onboarding.invites_hint')}
				error={model.canContinue ? undefined : workspace.t('error.ws.invalid_email')}
			>
				<Textarea id="ob-invites" rows={4} bind:value={model.invites} placeholder="sandra@praxis.ch, marco@praxis.ch" />
			</FormField>
		{:else}
			<div class="flex items-center justify-between gap-4 rounded-xl border p-3">
				<Label for="ob-demo" class="flex-col items-start gap-1">
					<span>{workspace.t('ui.ws.onboarding.demo')}</span><span class="text-muted-foreground font-normal">
						{workspace.t('ui.ws.onboarding.demo_text')}
					</span>
				</Label>
				<Switch id="ob-demo" bind:checked={model.demoData} />
			</div>
			<p class="text-muted-foreground text-sm">
				{workspace.t('ui.ws.onboarding.summary', {
					name: model.companyName,
					modules: model.modules.length,
					invites: model.inviteList.length,
				})}
			</p>
		{/if}
		<div class="flex gap-2">
			{#if model.index > 0}<Button type="button" variant="outline" onclick={() => model.back()}>
					{workspace.t('ui.ws.calendar.previous')}
				</Button>{/if}
			<Button type="submit" class="flex-1" disabled={!model.canContinue || model.busy}>
				{model.step === 'finish' ? workspace.t('ui.ws.onboarding.create') : workspace.t('ui.ws.calendar.next')}
			</Button>
		</div>
		{#if model.step === 'team'}<Button
				type="button"
				variant="ghost"
				class="w-full"
				onclick={() => {
					model.invites = '';
					model.next();
				}}
			>
				{workspace.t('ui.ws.onboarding.skip')}
			</Button>{/if}
	</form>
</AuthShell>
