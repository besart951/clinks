import type { AppointmentStatus, CampaignStatus, InvoiceStatus, TaskPriority } from '../../domain/types.ts';
import type { Tone } from './StatusBadge.svelte';

export const invoiceTone: { [status in InvoiceStatus]: Tone } = {
	draft: 'neutral',
	open: 'info',
	partially_paid: 'accent',
	paid: 'success',
	overdue: 'danger',
	reminded: 'warning',
	cancelled: 'neutral',
};

export const appointmentTone: { [status in AppointmentStatus]: Tone } = {
	planned: 'info',
	confirmed: 'success',
	done: 'neutral',
	cancelled: 'danger',
};

export const priorityTone: { [priority in TaskPriority]: Tone } = {
	low: 'neutral',
	medium: 'info',
	high: 'warning',
	urgent: 'danger',
};

export const campaignTone: { [status in CampaignStatus]: Tone } = {
	draft: 'neutral',
	review: 'warning',
	approved: 'accent',
	scheduled: 'info',
	sent: 'success',
};
