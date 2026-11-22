import type { ModuleKey, PlanCode, Rappen } from './types.ts';

export interface Plan {
	code: PlanCode;
	monthlyPricePerSeat: Rappen;
	includedSeats: number;
	modules: readonly ModuleKey[];
}

export const plans: readonly Plan[] = [
	{
		code: 'starter',
		monthlyPricePerSeat: 1900,
		includedSeats: 3,
		modules: ['contacts', 'calendar', 'documents', 'planner', 'mail'],
	},
	{
		code: 'team',
		monthlyPricePerSeat: 3900,
		includedSeats: 10,
		modules: ['contacts', 'calendar', 'documents', 'planner', 'mail', 'finance'],
	},
	{
		code: 'business',
		monthlyPricePerSeat: 5900,
		includedSeats: 50,
		modules: ['contacts', 'calendar', 'documents', 'planner', 'mail', 'finance', 'physio', 'spitex'],
	},
];

export function planFor(code: PlanCode): Plan {
	return plans.find((plan) => plan.code === code) ?? plans[0];
}

/** Two months free when paying yearly. */
export function priceFor(plan: Plan, seats: number, cycle: 'monthly' | 'yearly'): Rappen {
	const monthly = plan.monthlyPricePerSeat * Math.max(seats, 1);
	return cycle === 'yearly' ? monthly * 10 : monthly;
}

export function planIncludes(code: PlanCode, module: ModuleKey): boolean {
	return planFor(code).modules.includes(module);
}
