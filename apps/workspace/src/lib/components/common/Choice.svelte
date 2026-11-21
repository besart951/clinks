<script lang="ts" module>
	export interface ChoiceOption {
		value: string;
		label: string;
	}
</script>

<script lang="ts">
	import * as Select from '@clinks/ui-shared/components/ui/select';


	let {
		id,
		value = $bindable(''),
		options,
		placeholder = '',
		label,
		onchange,
		class: className = 'w-full',
		size = 'default',
		invalid = false,
	}: {
		id?: string;
		value?: string;
		options: ChoiceOption[];
		placeholder?: string;
		label?: string;
		onchange?: (value: string) => void;
		class?: string;
		size?: 'sm' | 'default';
		invalid?: boolean;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value)?.label ?? placeholder);
</script>

<Select.Root type="single" bind:value onValueChange={(next) => onchange?.(next)}>
	<Select.Trigger {id} class={className} {size} aria-label={label} aria-invalid={invalid || undefined}>
		<span data-slot="select-value" class:text-muted-foreground={!value}>{selected}</span>
	</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>
