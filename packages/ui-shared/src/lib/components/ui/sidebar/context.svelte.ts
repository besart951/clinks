import { createContext } from 'svelte';

export class SidebarState {
	open = $state(true);
	mobile = $state(false);
	variant = $derived(this.open ? ('expanded' as const) : ('collapsed' as const));

	toggle() {
		if (this.mobile) this.open = true;
		else this.open = !this.open;
	}
	close() {
		this.open = false;
	}
}

export const [getSidebarContext, setSidebarContext] = createContext<SidebarState>();
