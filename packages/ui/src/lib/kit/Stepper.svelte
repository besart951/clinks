<script lang="ts" module>
	export interface StepSpec {
		label: string;
		/** Who owns the step, shown small next to the label. */
		owner?: string;
		state: 'done' | 'current' | 'todo';
	}
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	let { steps }: { steps: StepSpec[] } = $props();
</script>

<ol class="flex flex-wrap gap-1.5">
	{#each steps as step, index (step.label)}
		<li
			class="inline-flex h-7 items-center gap-1.5 rounded-full border pr-3 pl-1 text-[13px] font-medium {step.state ===
			'current'
				? 'bg-primary text-primary-foreground border-primary'
				: step.state === 'done'
					? 'text-success border-success/30'
					: 'bg-muted text-muted-foreground border-transparent'}"
			aria-current={step.state === 'current' ? 'step' : undefined}
		>
			<span
				class="grid size-5 place-items-center rounded-full text-[11px] {step.state === 'done'
					? 'bg-success text-white'
					: step.state === 'current'
						? 'bg-primary-foreground text-primary'
						: 'bg-background'}"
			>
				{#if step.state === 'done'}<Check class="size-3" />{:else}{index + 1}{/if}
			</span>
			{step.label}
			{#if step.owner}<span class="text-[11px] font-normal opacity-70">{step.owner}</span>{/if}
		</li>
	{/each}
</ol>
