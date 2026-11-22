<script lang="ts" module>
	export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
</script>

<script lang="ts">
	let { tone = 'neutral', label }: { tone?: Tone; label: string } = $props();

	const tones: { [key in Tone]: string } = {
		neutral: 'bg-muted text-muted-foreground',
		info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
		success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
		warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
		danger: 'bg-red-500/10 text-red-700 dark:text-red-300',
		accent: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
	};
</script>

<span
	class="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap {tones[tone]}"
>
	{label}
</span>
