<script lang="ts">
	import { onMount } from 'svelte';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import TaskSheet from '#lib/components/planner/TaskSheet.svelte';
	import ComposeSheet from '#lib/components/mail/ComposeSheet.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { minutesToTime, today } from '@clinks/domain/dates';
	import type { Appointment, Contact, MailTemplate } from '@clinks/domain/types';
	import type { QuickCreate } from '#lib/features/shell/quick-create.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** The create sheets for the whole app: any page opens them in place through `QuickCreate`. */
	let { quick }: { quick: QuickCreate } = $props();
	const workspace = useWorkspace();
	const people = new PeopleDirectory(workspace);
	let contacts = $state.raw<Contact[]>([]);
	let templates = $state.raw<MailTemplate[]>([]);
	let appointments = $state.raw<Appointment[]>([]);
	let appointmentSheet: AppointmentSheet;
	let taskSheet: TaskSheet;
	let composeSheet: ComposeSheet;

	/** Loads what the sheets pick from right before one opens, so lists are current and unused data stays unloaded. */
	async function load(parts: { appointments?: boolean; templates?: boolean }) {
		const api = workspace.api;
		const can = (permission: Parameters<typeof workspace.session.can>[0]) => workspace.session.can(permission);
		const [nextContacts, nextAppointments, nextTemplates] = await Promise.all([
			can('contacts.read') ? api.contacts.list() : Promise.resolve([]),
			parts.appointments && can('calendar.read') ? api.appointments.list() : Promise.resolve(appointments),
			parts.templates && can('mail.read') ? api.templates.list() : Promise.resolve(templates),
		]);
		contacts = nextContacts;
		appointments = nextAppointments;
		templates = nextTemplates;
	}

	/** The next half hour, so a new appointment starts at a sensible time today. */
	function nextSlot() {
		const now = new Date();
		const minutes = Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30, 22 * 60);
		return { startTime: minutesToTime(minutes), endTime: minutesToTime(minutes + 30) };
	}

	onMount(() =>
		quick.register({
			appointment: async (preset) => {
				await workspace.run(() => load({ appointments: true }));
				const contact = contacts.find((candidate) => candidate.id === preset.contactId);
				appointmentSheet.show(null, {
					date: today(),
					...nextSlot(),
					assigneeId: workspace.session.user?.id ?? null,
					contactId: preset.contactId ?? null,
					title: preset.title ?? (contact ? contactName(contact) : ''),
				});
			},
			task: async (preset) => {
				await workspace.run(() => load({}));
				const me = workspace.session.user?.id;
				taskSheet.show(null, { contactId: preset.contactId ?? null, assigneeIds: me ? [me] : [] });
			},
			mail: async (preset) => {
				await workspace.run(() => load({ templates: true }));
				composeSheet.show(preset);
			},
		}),
	);
</script>

<AppointmentSheet bind:this={appointmentSheet} {contacts} people={people.people} {appointments} />
<TaskSheet bind:this={taskSheet} {contacts} {people} />
<ComposeSheet bind:this={composeSheet} {contacts} {templates} />
