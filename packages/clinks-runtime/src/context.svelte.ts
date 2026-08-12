import { createContext } from 'svelte';
import type { ClinksClient } from '@clinks/api-client';
import type { ThemeViewModel } from './theme-view-model.svelte';
import type { TranslationBundleViewModel } from './translation-bundle-view-model.svelte';

export interface ClinksRuntime {
	readonly client: ClinksClient;
	readonly theme: ThemeViewModel;
	readonly translations: TranslationBundleViewModel;
}

export const [useClinksRuntime, setClinksRuntime] = createContext<ClinksRuntime>();
