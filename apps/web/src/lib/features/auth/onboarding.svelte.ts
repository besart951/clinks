import { coreModules, moduleKeys, type Industry, type ModuleKey } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

export const onboardingSteps = ['company', 'industry', 'modules', 'team', 'finish'] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

const suggested: { [industry in Industry]: ModuleKey[] } = {
	physio: ['physio', 'finance', 'mail', 'planner'],
	spitex: ['spitex', 'finance', 'planner'],
	services: ['finance', 'mail', 'planner'],
};

/** The five steps after sign-up that create the first workspace. */
export class OnboardingModel {
	step = $state<OnboardingStep>('company');
	companyName = $state('');
	industry = $state<Industry>('physio');
	modules = $state<ModuleKey[]>(suggested.physio);
	invites = $state('');
	demoData = $state(true);
	busy = $state(false);
	error = $state('');
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	get index() {
		return onboardingSteps.indexOf(this.step);
	}

	get optionalModules(): ModuleKey[] {
		return moduleKeys.filter((module) => !coreModules.includes(module));
	}

	get inviteList(): string[] {
		return this.invites
			.split(/[\s,;]+/)
			.map((email) => email.trim())
			.filter(Boolean);
	}

	get canContinue(): boolean {
		if (this.step === 'company') return this.companyName.trim().length > 1;
		if (this.step === 'team') return this.inviteList.every((email) => /^\S+@\S+\.\S+$/.test(email));
		return true;
	}

	chooseIndustry(industry: Industry) {
		this.industry = industry;
		this.modules = [...suggested[industry]];
	}

	toggleModule(module: ModuleKey) {
		this.modules = this.modules.includes(module)
			? this.modules.filter((candidate) => candidate !== module)
			: [...this.modules, module];
	}

	next() {
		if (this.canContinue && this.index < onboardingSteps.length - 1) this.step = onboardingSteps[this.index + 1];
	}

	back() {
		if (this.index > 0) this.step = onboardingSteps[this.index - 1];
	}

	async finish(): Promise<boolean> {
		this.busy = true;
		this.error = '';
		try {
			const tenant = await this.#workspace.account.completeOnboarding(
				{
					companyName: this.companyName,
					industry: this.industry,
					modules: this.modules,
					invites: this.inviteList,
					demoData: this.demoData,
				},
				(tenantId) => this.#workspace.seedDemo(tenantId),
			);
			await this.#workspace.session.refresh();
			await this.#workspace.session.switchTenant(tenant.id);
			return true;
		} catch (error) {
			this.error = this.#workspace.message(error);
			return false;
		} finally {
			this.busy = false;
		}
	}
}
