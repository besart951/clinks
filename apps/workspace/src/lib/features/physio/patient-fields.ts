import type { InlineFieldSpec } from '../../components/kit/inline-edit.svelte.ts';
import type { Contact } from '../../domain/types.ts';
import { contactFields, type FieldText } from '../contacts/contact-fields.ts';

export const patientLanguages = ['de', 'fr', 'it', 'en'] as const;
export const billingModes = ['tiers_garant', 'tiers_payant'] as const;

/** AHV numbers: 756.XXXX.XXXX.XX */
export function validAhv(value: string): boolean {
	return value === '' || /^756\.\d{4}\.\d{4}\.\d{2}$/.test(value);
}

/** Master data of a patient or Spitex client: the contact rows plus language and AHV number. */
export function patientMasterFields(contact: Contact, text: FieldText): InlineFieldSpec[] {
	const base = contactFields(contact, text).filter((field) => field.key !== 'insurer');
	const birthIndex = base.findIndex((field) => field.key === 'birthDate');
	const extra: InlineFieldSpec[] = [
		{
			key: 'ahvNumber',
			label: text.t('ui.ws.field.ahv'),
			value: contact.ahvNumber ?? '',
			kind: 'masked',
			removable: true,
			validate: (value) => (validAhv(value) ? null : text.t('ui.ws.field.ahv_invalid')),
		},
	];
	const language: InlineFieldSpec = {
		key: 'language',
		label: text.t('ui.ws.field.language'),
		value: contact.language ?? '',
		kind: 'select',
		removable: true,
		options: patientLanguages.map((code) => ({ value: code, label: text.t(`ui.ws.language.${code}`) })),
	};
	return [...base.slice(0, birthIndex + 1), ...extra, ...base.slice(birthIndex + 1), language].sort(
		(left, right) => Number(left.key === 'companyName') - Number(right.key === 'companyName'),
	);
}

/** The insurance section; its summary is the billing mode or insurer. */
export function insuranceFields(contact: Contact, text: FieldText): InlineFieldSpec[] {
	return [
		{ key: 'insurer', label: text.t('ui.ws.field.insurer'), value: contact.insurer },
		{
			key: 'insuranceNumber',
			label: text.t('ui.ws.field.insurance_number'),
			value: contact.insuranceNumber ?? '',
			mono: true,
		},
		{
			key: 'billingMode',
			label: text.t('ui.ws.field.billing_mode'),
			value: contact.billingMode ?? '',
			kind: 'select',
			options: billingModes.map((mode) => ({ value: mode, label: text.t(`ui.ws.billing_mode.${mode}`) })),
		},
	];
}
