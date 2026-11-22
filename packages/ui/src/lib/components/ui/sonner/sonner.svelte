<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme="system"
	class="toaster group"
	toastOptions={{
		classes: {
			toast:
				'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:backdrop-blur-md',
			description: 'group-[.toast]:text-muted-foreground',
			actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
			cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
			error: 'group-[.toast]:bg-destructive/10 group-[.toast]:border-destructive/30 group-[.toast]:text-destructive',
			success:
				'group-[.toast]:bg-emerald-500/10 group-[.toast]:border-emerald-500/30 group-[.toast]:text-emerald-600 dark:group-[.toast]:text-emerald-400',
		},
	}}
	{...restProps}
/>
