<script lang="ts">
	import { onMount } from 'svelte';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Plus from '@lucide/svelte/icons/plus';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Flag from '@lucide/svelte/icons/flag';
	import House from '@lucide/svelte/icons/house';
	import Banknote from '@lucide/svelte/icons/banknote';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Mail from '@lucide/svelte/icons/mail';
	import Wallet from '@lucide/svelte/icons/wallet';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Circle from '@lucide/svelte/icons/circle';
	import X from '@lucide/svelte/icons/x';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Progress } from '@clinks/ui/components/ui/progress';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ActivityFeed, { type Actor } from '#lib/components/common/ActivityFeed.svelte';
	import KpiCard from '#lib/components/kit/KpiCard.svelte';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import PastToggle from '@clinks/ui/kit/PastToggle.svelte';
	import { minutesBetween } from '@clinks/domain/dates';
	import { DashboardModel } from '#lib/features/dashboard/dashboard.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { today } from '@clinks/domain/dates';
	import { href } from '#lib/navigation';
	import { useQuickCreate } from '#lib/features/shell/quick-create.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const quick = useQuickCreate();
	const session = workspace.session;
	/** Where today's appointments lead: the calendar, or the own plan for staff without it. */
	const agendaPath = $derived(session.can('calendar.read') ? '/calendar' : '/visits');
	const model = new DashboardModel(workspace);
	let actors = $state(new Map<string, Actor>());

	const hintIcons = { invoice: ReceiptText, task: Flag, visit: House, billing: Banknote };
	const hintTone = {
		invoice: 'text-destructive',
		task: 'text-[var(--warning)]',
		visit: 'text-[var(--warning)]',
		billing: 'text-muted-foreground',
	};
	const kindColor = {
		physio: 'var(--label-blue)',
		spitex: 'var(--label-green)',
		meeting: 'var(--label-purple)',
		other: 'var(--label-gray)',
	};
	const statusColor = {
		planned: 'var(--input)',
		confirmed: 'var(--label-blue)',
		done: 'var(--success)',
		cancelled: 'var(--muted-foreground)',
	};

	onMount(() => {
		void workspace.api.people().then((people) => (actors = new Map(people.map((person) => [person.id, person]))));
		return model.resource.connect();
	});
</script>

<svelte:head><title>{workspace.t('ui.ws.nav.dashboard')} · CLinks</title></svelte:head>

<header class="mb-6 flex flex-wrap items-end gap-4">
	<div class="flex-1">
		<h1 class="text-[30px] leading-9 font-semibold tracking-tight">
			{workspace.t(model.greeting(), { name: session.user?.firstName ?? '' })}
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			{workspace.i18n.format(today(), { weekday: 'long', day: 'numeric', month: 'long' })}
		</p>
	</div>
	{#if session.hasModule('calendar') && session.can('calendar.write')}
		<Button onclick={() => quick.appointment()}>
			<Plus class="size-4" />{workspace.t('ui.ws.command.new_appointment')}
		</Button>
	{/if}
</header>

<AsyncView resource={model.resource} skeleton="cards">
	{#snippet children(data)}
		{@const doneSteps = data.setup.filter((step) => step.done).length}
		{@const now = new Date().toISOString()}
		{@const next = data.appointmentsToday.find((row) => row.start > now)}
		{#if !model.setupDismissed && doneSteps < data.setup.length && session.can('settings.manage')}
			<Card.Root class="mb-6">
				<Card.Header>
					<Card.Title>{workspace.t('ui.ws.setup.title')}</Card.Title>
					<Card.Description>
						{workspace.t('ui.ws.setup.progress', { done: doneSteps, total: data.setup.length })}
					</Card.Description>
					<Card.Action>
						<Button
							variant="ghost"
							size="icon-sm"
							onclick={() => model.dismissSetup()}
							aria-label={workspace.t('ui.ws.banner.hide')}
						>
							<X class="size-4" />
						</Button>
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

		<div class="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#if session.hasModule('calendar')}
				<KpiCard
					path="/calendar"
					kpi={{
						icon: CalendarDays,
						label: workspace.t('ui.ws.dashboard.appointments_today'),
						value: String(data.appointmentsToday.filter((row) => row.end < now).length),
						of: `/${data.appointmentsToday.length}`,
						sub: workspace.t('ui.ws.dashboard.done_so_far'),
					}}
				/>
				<KpiCard
					path="/calendar"
					kpi={{
						icon: Clock,
						label: workspace.t('ui.ws.dashboard.up_next'),
						value: next ? workspace.i18n.time(next.start) : '–',
						sub: next ? next.title : workspace.t('ui.ws.dashboard.day_done'),
					}}
				/>
			{/if}
			{#if session.hasModule('planner') && session.can('planner.read')}
				<KpiCard
					path="/planner"
					kpi={{
						icon: SquareKanban,
						label: workspace.t('ui.ws.dashboard.open_tasks'),
						value: String(data.openTaskCount),
						sub: workspace.t('ui.ws.dashboard.mine', { count: data.myTasks.length }),
					}}
				/>
			{:else if session.hasModule('mail') && session.can('mail.read')}
				<KpiCard
					path="/mail"
					kpi={{
						icon: Mail,
						label: workspace.t('ui.ws.dashboard.unread_mails'),
						value: String(data.unreadMails),
						sub: workspace.t('ui.ws.dashboard.in_inbox'),
					}}
				/>
			{/if}
			{#if session.hasModule('finance') && session.can('finance.read')}
				<KpiCard
					path="/finance/invoices"
					kpi={{
						icon: Wallet,
						label: workspace.t('ui.ws.dashboard.open_invoices'),
						value: workspace.i18n.money(data.openInvoices.total),
						sub:
							data.openInvoices.overdue > 0
								? workspace.t('ui.ws.dashboard.overdue_count', { count: data.openInvoices.overdue })
								: workspace.t('ui.ws.dashboard.invoice_count', { count: data.openInvoices.count }),
						tone: data.openInvoices.overdue > 0 ? 'danger' : 'default',
					}}
				/>
			{/if}
		</div>

		{#snippet hintRow(hint: (typeof data.hints)[number])}
			{@const Icon = hintIcons[hint.kind]}
			<a
				class="hover:bg-accent grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 rounded-md px-1 py-2"
				href={href(hint.path)}
			>
				<Icon class="mt-0.5 size-4 {hintTone[hint.kind]}" />
				<span class="grid min-w-0 text-[13px] leading-snug">
					<b class="truncate font-semibold">{hint.title}</b>
					<span class="text-muted-foreground">
						{workspace.t(hint.key, {
							...hint.params,
							...(hint.kind === 'visit' ? { date: workspace.i18n.dateTime(String(hint.params.date)) } : {}),
						})}
					</span>
				</span>
			</a>
		{/snippet}
		<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
			<section class="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
				<header class="mb-2 flex items-center gap-2">
					<h2 class="text-sm font-semibold">{workspace.t('ui.ws.dashboard.agenda')}</h2>
					<span class="text-muted-foreground text-sm">
						{workspace.t('ui.ws.dashboard.appointment_count', { count: data.appointmentsToday.length })}
					</span>
					<Button variant="ghost" size="sm" class="ml-auto" href={href(agendaPath)}>
						{workspace.t(session.can('calendar.read') ? 'ui.ws.module.calendar' : 'ui.ws.visits.title')}<ChevronRight
							class="size-4"
						/>
					</Button>
				</header>
				{#if data.appointmentsToday.length === 0}
					<p class="text-muted-foreground py-10 text-center text-sm">
						{workspace.t('ui.ws.dashboard.no_appointments')}
					</p>
				{:else}
					<ol class="grid">
						{#each data.appointmentsToday as appointment, index (appointment.id)}
							{@const contact = appointment.contactId ? data.contacts.get(appointment.contactId) : undefined}
							{@const past = appointment.end < now}
							{#if appointment.start > now && (index === 0 || data.appointmentsToday[index - 1].start <= now)}
								<li
									class="relative my-1 ml-14 h-px bg-[var(--destructive)]"
									aria-label={workspace.t('ui.ws.dashboard.now')}
								>
									<span class="absolute -top-[3px] -left-1 size-[7px] rounded-full bg-[var(--destructive)]"></span>
								</li>
							{/if}
							<li class="rise" style:--i={index}>
								<a
									class="hover:bg-accent grid grid-cols-[3.5rem_3px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-2 {past
										? 'opacity-60'
										: ''}"
									href={href(
										session.can('calendar.read')
											? `/calendar?date=${today()}&appointment=${appointment.id}`
											: agendaPath,
									)}
								>
									<span class="grid text-[13px] leading-tight">
										<b class="font-semibold tabular-nums">{workspace.i18n.time(appointment.start)}</b><span
											class="text-muted-foreground text-xs"
										>
											{minutesBetween(appointment.start, appointment.end)} min
										</span>
									</span>
									<span class="h-9 rounded-full opacity-60" style:background={kindColor[appointment.kind]}></span>
									<span class="grid min-w-0 text-sm leading-tight">
										<span class="truncate">{contact ? contactName(contact) : appointment.title}</span>
										<span class="text-muted-foreground flex items-center gap-1.5 truncate text-[13px]">
											<span class="size-1.5 shrink-0 rounded-full" style:background={statusColor[appointment.status]}
											></span>{contact
												? appointment.title
												: appointment.location || workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
										</span>
									</span>
									<span class="text-muted-foreground text-xs">
										{workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
									</span>
								</a>
							</li>
						{/each}
						{#if data.appointmentsToday.every((row) => row.start <= now)}
							<li
								class="relative my-1 ml-14 h-px bg-[var(--destructive)]"
								aria-label={workspace.t('ui.ws.dashboard.now')}
							>
								<span class="absolute -top-[3px] -left-1 size-[7px] rounded-full bg-[var(--destructive)]"></span>
							</li>
						{/if}
					</ol>
				{/if}
			</section>

			<SideCard card={{ title: workspace.t('ui.ws.dashboard.hints'), count: data.hints.length }}>
				{#if data.hints.length === 0}
					<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.dashboard.no_hints')}</p>
				{/if}
				<div class="grid">
					{#each data.hints.slice(0, 6) as hint (hint.path + hint.key)}{@render hintRow(hint)}{/each}
				</div>
				{#if data.hints.length > 6}
					<PastToggle label={workspace.t('ui.ws.dashboard.more_hints', { count: data.hints.length - 6 })}>
						{#each data.hints.slice(6) as hint (hint.path + hint.key)}{@render hintRow(hint)}{/each}
					</PastToggle>
				{/if}
			</SideCard>

			{#if session.hasModule('planner') && session.can('planner.read')}
				<SideCard
					card={{
						title: workspace.t('ui.ws.dashboard.my_tasks'),
						count: data.myTasks.length,
						addLabel: workspace.t('ui.ws.command.new_task'),
					}}
					onadd={session.can('planner.write') ? () => quick.task() : undefined}
				>
					{#if data.myTasks.length === 0}
						<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.dashboard.no_tasks')}</p>
					{/if}
					<div class="grid">
						{#each data.myTasks as task (task.id)}
							<a
								class="hover:bg-accent flex h-9 items-center gap-2 rounded-md px-1 text-sm"
								href={href(`/planner/${task.id}`)}
							>
								<span class="bg-input size-2 shrink-0 rounded-full"></span>
								<span class="min-w-0 flex-1 truncate">{task.title}</span>
								{#if task.dueDate}<span
										class="shrink-0 text-xs {task.dueDate < today() ? 'text-destructive' : 'text-muted-foreground'}"
									>
										{workspace.i18n.date(task.dueDate)}
									</span>{/if}
							</a>
						{/each}
					</div>
				</SideCard>
			{/if}
			{#if session.can('audit.read')}
				<section
					class="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)] lg:col-start-1 lg:row-start-2 {session.hasModule(
						'planner',
					)
						? ''
						: 'lg:col-span-2'}"
				>
					<header class="mb-2 flex items-center gap-2">
						<h2 class="text-sm font-semibold">{workspace.t('ui.ws.dashboard.recent_activity')}</h2>
						<Button variant="ghost" size="sm" class="ml-auto" href={href('/activity')}>
							{workspace.t('ui.ws.notifications.show_all')}<ChevronRight class="size-4" />
						</Button>
					</header>
					<ActivityFeed entries={data.activity} {actors} />
				</section>
			{/if}
		</div>
	{/snippet}
</AsyncView>
