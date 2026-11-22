<script lang="ts">
	import type { Appointment } from '@clinks/domain/types';
	import { minutesBetween } from '@clinks/domain/dates';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { appointment, index = 0 }: { appointment: Appointment; index?: number } = $props();

	const workspace = useWorkspace();
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
</script>

<a
	class="rise hover:bg-accent grid h-10 grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1"
	style:--i={index}
	href={href(`/calendar?date=${appointment.start.slice(0, 10)}&appointment=${appointment.id}`)}
	title={appointment.title}
>
	<span class="size-2 rounded-full" style:background={kindColor[appointment.kind]} aria-hidden="true"></span>
	<span class="flex min-w-0 items-baseline gap-1.5 text-[13px] whitespace-nowrap">
		<b class="font-medium {appointment.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}">
			{workspace.i18n.format(new Date(appointment.start), { weekday: 'short', day: 'numeric', month: 'short' })}
		</b>
		<span class="text-muted-foreground truncate">
			{workspace.i18n.time(appointment.start)} · {minutesBetween(appointment.start, appointment.end)} min
		</span>
	</span>
	<span
		class="size-[7px] rounded-full"
		style:background={statusColor[appointment.status]}
		title={workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
	></span>
</a>
