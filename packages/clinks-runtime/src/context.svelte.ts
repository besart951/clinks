import { getContext, setContext } from 'svelte';
import type { ClinksClient } from '@clinks/api-client';
import type { ThemeViewModel } from './theme-view-model.svelte';
import type { TranslationBundleViewModel } from './translation-bundle-view-model.svelte';

const runtimeContext = Symbol('clinks-runtime');

export interface ClinksRuntime {
	readonly client: ClinksClient;
	readonly theme: ThemeViewModel;
	readonly translations: TranslationBundleViewModel;
}

export function setClinksRuntime(runtime: ClinksRuntime) {
	setContext(runtimeContext, runtime);
}

export function useClinksRuntime(): ClinksRuntime {
	const runtime = getContext<ClinksRuntime>(runtimeContext);
	if (!runtime) throw new Error('ClinksRuntimeProvider is required.');
	return runtime;
}
