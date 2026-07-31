<script lang="ts">
	import * as Select from './components/ui/select/index.ts';

	export type ThemeMode = 'light' | 'dark' | 'system';

	export interface ThemeSelection {
		readonly mode: ThemeMode;
		setMode(mode: ThemeMode): void;
	}

	export interface ThemeLabels {
		readonly label: string;
		readonly system: string;
		readonly light: string;
		readonly dark: string;
	}

	let { model, labels }: { model: ThemeSelection; labels: ThemeLabels } = $props();
	let activeLabel = $derived(labels[model.mode]);
</script>

<Select.Root type="single" value={model.mode} onValueChange={(value) => model.setMode(value as ThemeMode)}>
	<Select.Trigger aria-label={labels.label} class="min-w-24">
		{activeLabel}
	</Select.Trigger>
	<Select.Content>
		<Select.Item value="system">{labels.system}</Select.Item>
		<Select.Item value="light">{labels.light}</Select.Item>
		<Select.Item value="dark">{labels.dark}</Select.Item>
	</Select.Content>
</Select.Root>
