import { createContext } from 'svelte';
import type { AdminDashboardViewModel } from '@clinks/clinks-runtime';

export const [getAdminModel, setAdminModel] = createContext<AdminDashboardViewModel>();
