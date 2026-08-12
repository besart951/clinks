import { createContext } from 'svelte';
import type { AuthStore } from './auth-store.svelte.ts';

export const [useAuth, setAuth] = createContext<AuthStore>();
