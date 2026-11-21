<script lang="ts">
	import { onMount } from 'svelte';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Mail from '@lucide/svelte/icons/mail';
	import Wallet from '@lucide/svelte/icons/wallet';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Circle from '@lucide/svelte/icons/circle';
	import X from '@lucide/svelte/icons/x';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Progress } from '@clinks/ui-shared/components/ui/progress';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import ActivityFeed, { type Actor } from '$lib/components/common/ActivityFeed.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import { DashboardModel } from '$lib/features/dashboard/dashboard.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { today } from '$lib/domain/dates';
	import { href } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const model = new DashboardModel(workspace);
	let actors = $state(new Map<string, Actor>());

	onMount(() => {
		void workspace.api.people().then((people) => (actors = new Map(people.map((person) => [person.id, person]))));
		return model.resource.connect();
	});
</script>

<svelte:head><title>{workspace.t('ui.ws.nav.dashboard')} · CLinks</title></svelte:head>

<div class="mb-6">
	<p class="text-muted-foreground text-sm">
		{workspace.i18n.format(today(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
	</p>
	<h1 class="text-2xl font-semibold tracking-tight">
		{workspace.t(model.greeting(), { name: session.user?.firstName ?? '' })}
	</h1>
</div>

<AsyncView resource={model.resource} skeleton="cards">
	{#snippet children(data)}
		{@const doneSteps = data.setup.filter((step) => step.done).length}
		{#if !model.setupDismissed && doneSteps < data.setup.length && session.can('settings.manage')}
			<Card.Root class="mb-6">
				<Card.Header>
					<Card.Title>{workspace.t('ui.ws.setup.title')}</Card.Title>
					<Card.Description
						>{workspace.t('ui.ws.setup.progress', { done: doneSteps, total: data.setup.length })}</Card.Description
					>
					<Card.Action>
						<Button
							variant="ghost"
							size="icon-sm"
							onclick={() => model.dismissSetup()}
							aria-label={workspace.t('ui.ws.banner.hide')}><X class="size-4" /></Button
						>
					</Card.Action>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Progress value={(doneSteps / data.setup.length) * 100} aria-label={workspace.t('ui.ws.setup.title')} />
					<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.setup as step (step.key)}
							<li>
								<a
									href={href(step.path)}
									class="hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm {step.done
										? 'text-muted-foreground line-through'
										: ''}"
								>
									{#if step.done}<CircleCheck class="size-4 text-emerald-600" />{:else}<Circle class="size-4" />{/if}
									{workspace.t(`ui.ws.setup.${step.key}`)}
								</a>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#if session.hasModule('calendar')}
				<a href={href('/calendar')} class="block"
					><Card.Root class="hover:border-foreground/20 h-full transition-colors"
						><Card.Content class="space-y-1">
							<p class="text-muted-foreground flex items-center gap-2 text-sm">
								<CalendarDays class="size-4" />{workspace.t('ui.ws.dashboard.appointments_today')}
							</p>
							<p class="text-3xl font-semibold">{data.appointmentsToday.length}</p>
							<p class="text-muted-foreground truncate text-xs">
								{#if data.appointmentsToday.find((row) => new Date(row.start) > new Date())}
									{@const next = data.appointmentsToday.find((row) => new Date(row.start) > new Date())!}
									{workspace.t('ui.ws.dashboard.next_at', { time: workspace.i18n.time(next.start), title: next.title })}
								{:else}{workspace.t('ui.ws.dashboard.day_done')}{/if}
							</p>
						</Card.Content></Card.Root
					></a
				>
			{/if}
			{#if session.hasModule('planner') && session.can('planner.read')}
				<a href={href('/planner')} class="block"
					><Card.Root class="hover:border-foreground/20 h-full transition-colors"
						><Card.Content class="space-y-1">
							<p class="text-muted-foreground flex items-center gap-2 text-sm">
								<SquareKanban class="size-4" />{workspace.t('ui.ws.dashboard.open_tasks')}
							</p>
							<p class="text-3xl font-semibold">{data.openTaskCount}</p>
							<p class="text-muted-foreground text-xs">
								{workspace.t('ui.ws.dashboard.mine', { count: data.myTasks.length })}
							</p>
						</Card.Content></Card.Root
					></a
				>
			{/if}
			{#if session.hasModule('mail') && session.can('mail.read')}
				<a href={href('/mail')} class="block"
					><Card.Root class="hover:border-foreground/20 h-full transition-colors"
						><Card.Content class="space-y-1">
							<p class="text-muted-foreground flex items-center gap-2 text-sm">
								<Mail class="size-4" />{workspace.t('ui.ws.dashboard.unread_mails')}
							</p>
							<p class="text-3xl font-semibold">{data.unreadMails}</p>
							<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.dashboard.in_inbox')}</p>
						</Card.Content></Card.Root
					></a
				>
			{/if}
			{#if session.hasModule('finance') && session.can('finance.read')}
				<a href={href('/finance')} class="block"
					><Card.Root class="hover:border-foreground/20 h-full transition-colors"
						><Card.Content class="space-y-1">
							<p class="text-muted-foreground flex items-center gap-2 text-sm">
								<Wallet class="size-4" />{workspace.t('ui.ws.dashboard.open_invoices')}
							</p>
							<p class="text-3xl font-semibold">{workspace.i18n.money(data.openInvoices.total)}</p>
							<p class="text-muted-foreground text-xs">
								{workspace.t('ui.ws.dashboard.invoice_count', { count: data.openInvoices.count })}
								{#if data.openInvoices.overdue > 0}· <span class="text-destructive"
										>{workspace.t('ui.ws.dashboard.overdue_count', { count: data.openInvoices.overdue })}</span
									>{/if}
							</p>
						</Card.Content></Card.Root
					></a
				>
			{/if}
		</div>

		<div class="grid gap-6 lg:grid-cols-3">
			<Card.Root class="lg:col-span-2">
				<Card.Header><Card.Title>{workspace.t('ui.ws.dashboard.agenda')}</Card.Title></Card.Header>
				<Card.Content>
					{#if data.appointmentsToday.length === 0}
						<p class="text-muted-foreground py-6 text-center text-sm">
							{workspace.t('ui.ws.dashboard.no_appointments')}
						</p>
					{:else}
						<ol class="divide-y">
							{#each data.appointmentsToday as appointment (appointment.id)}
								{@const contact = appointment.contactId ? data.contacts.get(appointment.contactId) : undefined}
								<li
									class="flex items-center gap-3 py-2.5 text-sm {new Date(appointment.end) < new Date()
										? 'opacity-60'
										: ''}"
								>
									<time class="w-24 shrink-0 tabular-nums" datetime={appointment.start}
										>{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(appointment.end)}</time
									>
									<a
										class="min-w-0 flex-1 truncate font-medium hover:underline"
										href={href(`/calendar?date=${today()}&appointment=${appointment.id}`)}>{appointment.title}</a
									>
									{#if contact}<a
											class="text-muted-foreground hidden truncate sm:block"
											href={href(`/contacts/${contact.id}`)}>{contactName(contact)}</a
										>{/if}
									<StatusBadge
										tone={appointment.status === 'confirmed'
											? 'success'
											: appointment.status === 'done'
												? 'neutral'
												: 'info'}
										label={workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
									/>
								</li>
							{/each}
						</ol>
					{/if}
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header><Card.Title>{workspace.t('ui.ws.dashboard.my_tasks')}</Card.Title></Card.Header>
				<Card.Content>
					{#if data.myTasks.length === 0}
						<p class="text-muted-foreground py-6 text-center text-sm">{workspace.t('ui.ws.dashboard.no_tasks')}</p>
					{:else}
						<ul class="space-y-2">
							{#each data.myTasks as task (task.id)}
								<li class="flex items-center gap-2 text-sm">
									<a class="min-w-0 flex-1 truncate hover:underline" href={href(`/planner?task=${task.id}`)}
										>{task.title}</a
									>
									{#if task.dueDate}
										<span
											class="shrink-0 text-xs {task.dueDate < today() ? 'text-destructive' : 'text-muted-foreground'}"
											>{workspace.i18n.date(task.dueDate)}</span
										>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
			{#if session.can('audit.read')}
				<Card.Root class="lg:col-span-3">
					<Card.Header>
						<Card.Title>{workspace.t('ui.ws.dashboard.recent_activity')}</Card.Title>
						<Card.Action
							><Button variant="ghost" size="sm" href={href('/activity')}
								>{workspace.t('ui.ws.notifications.show_all')}</Button
							></Card.Action
						>
					</Card.Header>
					<Card.Content><ActivityFeed entries={data.activity} {actors} /></Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/snippet}
</AsyncView>
