<script lang="ts">
	import { onMount } from 'svelte';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Upload from '@lucide/svelte/icons/upload';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { Label } from '@clinks/ui/components/ui/label';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import { ProfileModel } from '#lib/features/settings/settings.svelte';
	import { locales, type Locale } from '@clinks/i18n-types/catalog';
	import type { ThemeMode } from '#lib/state/theme.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ProfileModel(workspace);
	const user = $derived(workspace.session.user);
	let enabling = $state(false);
	let avatarInput: HTMLInputElement;
	onMount(() => {
		model.load();
		return model.sessions.connect();
	});

	function save(event: SubmitEvent) {
		event.preventDefault();
		void model.save();
	}

	function changePassword(event: SubmitEvent) {
		event.preventDefault();
		void model.changePassword();
	}

	async function confirmTwoFactor(event: SubmitEvent) {
		event.preventDefault();
		if (await model.setTwoFactor(!user?.twoFactorEnabled)) enabling = false;
	}

	function cancelTwoFactor() {
		enabling = false;
		model.twoFactorCode = '';
		model.twoFactorPassword = '';
		model.fields = {};
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.profile')} · CLinks</title></svelte:head>

<PageHeader title={workspace.t('ui.ws.settings.profile')} description={workspace.t('ui.ws.settings.profile_text')} />
<div class="space-y-6">
	<Card.Root>
		<Card.Header><Card.Title>{workspace.t('ui.ws.settings.personal')}</Card.Title></Card.Header>
		<Card.Content>
			<form class="grid gap-4 sm:grid-cols-2" onsubmit={save} novalidate>
				<div class="flex items-center gap-4 sm:col-span-2">
					<PersonAvatar
						person={{
							name: `${model.firstName} ${model.lastName}`,
							avatarColor: user?.avatarColor ?? '#71717a',
							avatarDataUrl: model.avatarDataUrl,
						}}
						size="lg"
					/>
					<!-- The native file field reads «Choose File · No file chosen» in the browser's language; a button instead. -->
					<input
						bind:this={avatarInput}
						id="avatar"
						type="file"
						accept="image/*"
						hidden
						onchange={(event) => model.setAvatar(event.currentTarget.files?.[0])}
					/>
					<Button type="button" variant="outline" size="sm" onclick={() => avatarInput.click()}>
						<Upload class="size-4" />{workspace.t('ui.ws.settings.change_photo')}
					</Button>
				</div>
				<FormField id="pf-first" label={workspace.t('ui.ws.field.first_name')} error={model.fields.firstName}>
					<Input id="pf-first" bind:value={model.firstName} />
				</FormField>
				<FormField id="pf-last" label={workspace.t('ui.ws.field.last_name')}>
					<Input id="pf-last" bind:value={model.lastName} />
				</FormField>
				<FormField id="pf-email" label={workspace.t('ui.email')} error={model.fields.email} class="sm:col-span-2">
					<Input id="pf-email" readonly={Boolean(workspace.remote)} type="email" bind:value={model.email} />
				</FormField>
				<fieldset class="space-y-3 sm:col-span-2">
					<legend class="mb-2 text-sm font-medium">{workspace.t('ui.ws.settings.notifications')}</legend>
					<div class="flex items-center justify-between gap-4">
						<Label for="n-app">{workspace.t('ui.ws.settings.notify_in_app')}</Label><Switch
							id="n-app"
							bind:checked={model.preferences.inApp}
						/>
					</div>
					<div class="flex items-center justify-between gap-4">
						<Label for="n-mail">{workspace.t('ui.ws.settings.notify_email')}</Label><Switch
							id="n-mail"
							bind:checked={model.preferences.email}
						/>
					</div>
					<div class="flex items-center justify-between gap-4">
						<Label for="n-push">{workspace.t('ui.ws.settings.notify_push')}</Label><Switch
							id="n-push"
							bind:checked={model.preferences.push}
						/>
					</div>
					<div class="flex items-center justify-between gap-4">
						<Label for="n-digest">{workspace.t('ui.ws.settings.digest')}</Label><Choice
							id="n-digest"
							class="w-40"
							bind:value={model.preferences.digest}
							options={(['never', 'daily', 'weekly'] as const).map((digest) => ({
								value: digest,
								label: workspace.t(`ui.ws.settings.digest_${digest}`),
							}))}
						/>
					</div>
				</fieldset>
				<div class="flex justify-end sm:col-span-2">
					<Button type="submit" disabled={model.busy}>{workspace.t('ui.save')}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{workspace.t('ui.ws.settings.display')}</Card.Title></Card.Header>
		<Card.Content class="grid gap-4 sm:grid-cols-2">
			<FormField id="pf-locale" label={workspace.t('ui.ws.settings.language')}>
				<Choice
					id="pf-locale"
					value={workspace.i18n.locale}
					options={locales.map((locale) => ({
						value: locale,
						label: locale === 'de-CH' ? 'Deutsch (Schweiz)' : 'English',
					}))}
					onchange={(value) => model.setLocale(value as Locale)}
				/>
			</FormField>
			<FormField id="pf-theme" label={workspace.t('ui.theme')}>
				<Choice
					id="pf-theme"
					value={workspace.theme.mode}
					options={(['system', 'light', 'dark'] as const).map((mode) => ({
						value: mode,
						label: workspace.t(`ui.theme_${mode}`),
					}))}
					onchange={(value) => workspace.theme.setMode(value as ThemeMode)}
				/>
			</FormField>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{workspace.t('ui.ws.settings.security')}</Card.Title></Card.Header>
		<Card.Content class="space-y-6">
			<form class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onsubmit={changePassword} novalidate>
				<FormField id="pw-current" label={workspace.t('ui.ws.settings.current_password')} error={model.fields.current}>
					<Input id="pw-current" type="password" autocomplete="current-password" bind:value={model.currentPassword} />
				</FormField>
				<FormField id="pw-new" label={workspace.t('ui.ws.auth.new_password')} error={model.fields.next}>
					<Input id="pw-new" type="password" autocomplete="new-password" bind:value={model.newPassword} />
				</FormField>
				<Button type="submit" variant="outline" disabled={!model.currentPassword || !model.newPassword}>
					{workspace.t('ui.ws.settings.change_password')}
				</Button>
			</form>
			<div class="space-y-3 border-t pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="font-medium">{workspace.t('ui.ws.settings.two_factor')}</p>
						<p class="text-muted-foreground text-sm">
							{user?.twoFactorEnabled
								? workspace.t('ui.ws.settings.two_factor_on')
								: workspace.t('ui.ws.settings.two_factor_off')}
						</p>
					</div>
					{#if user?.twoFactorEnabled}<Button
							variant="outline"
							onclick={() => (workspace.remote ? (enabling = true) : model.setTwoFactor(false))}
						>
							{workspace.t('ui.ws.settings.disable')}
						</Button>{:else if !enabling}<Button onclick={async () => (enabling = await model.startTwoFactor())}>
							{workspace.t('ui.ws.settings.enable')}
						</Button>{/if}
				</div>
				{#if model.recoveryCodes.length}<p>{workspace.t('ui.ws.settings.recovery_codes')}</p>
					<pre>{model.recoveryCodes.join('\n')}</pre>{/if}
				{#if enabling}
					<form
						class="bg-muted/50 flex flex-wrap items-end gap-3 rounded-lg border p-3"
						onsubmit={confirmTwoFactor}
						novalidate
					>
						{#if !user?.twoFactorEnabled}
							<p class="text-sm sm:basis-full">
								{workspace.remote ? model.twoFactorSecret : workspace.t('ui.ws.settings.two_factor_setup')}
							</p>
						{:else if workspace.remote}
							<FormField
								id="tf-password"
								label={workspace.t('ui.ws.settings.current_password')}
								error={model.fields.password}
							>
								<Input
									id="tf-password"
									name="password"
									type="password"
									autocomplete="current-password"
									required
									bind:value={model.twoFactorPassword}
								/>
							</FormField>
						{/if}
						<FormField
							id="tf-code"
							label={workspace.t('ui.ws.auth.code')}
							error={model.fields.code}
							hint={workspace.remote ? undefined : workspace.t('ui.ws.auth.two_factor_demo_hint')}
						>
							<Input
								id="tf-code"
								name="code"
								inputmode={user?.twoFactorEnabled ? 'text' : 'numeric'}
								autocomplete="one-time-code"
								autocorrect="off"
								autocapitalize="none"
								spellcheck={false}
								maxlength={user?.twoFactorEnabled ? 20 : 6}
								required
								bind:value={model.twoFactorCode}
							/>
						</FormField>
						<Button type="submit" disabled={model.busy}>{workspace.t('ui.ws.auth.verify_submit')}</Button>
						<Button type="button" variant="ghost" onclick={cancelTwoFactor}>{workspace.t('ui.ws.cancel')}</Button>
					</form>
				{/if}
			</div>
			<div class="space-y-2 border-t pt-4">
				<p class="font-medium">{workspace.t('ui.ws.settings.sessions')}</p>
				<ul class="divide-y rounded-lg border">
					{#each model.sessions.data ?? [] as session, index (session.id)}
						<li class="flex items-center gap-3 px-3 py-2 text-sm">
							<Monitor class="text-muted-foreground size-4" />
							<div class="flex-1">
								<p>{session.device}</p>
								<p class="text-muted-foreground text-xs">
									{session.location} · {workspace.i18n.relative(session.lastActiveAt)}
								</p>
							</div>
							{#if index === 0}<span class="text-xs text-emerald-600">
									{workspace.t('ui.ws.settings.this_device')}
								</span>{:else}<Button variant="ghost" size="sm" onclick={() => model.revoke(session.id)}>
									{workspace.t('ui.sign_out')}
								</Button>{/if}
						</li>
					{/each}
				</ul>
			</div>
		</Card.Content>
	</Card.Root>
</div>
