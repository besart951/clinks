# `@clinks/auth`

Client-side authentication and tenant-aware authorization for the Clinks Svelte applications.

## Provider

Wrap the application once and inject the router navigation function:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { AuthProvider } from '@clinks/auth';
</script>

<AuthProvider applicationScope="planer_link" navigate={goto}>
	{@render children()}
</AuthProvider>
```

The provider hydrates the HttpOnly-cookie session and exposes `loading`, `authenticated`, `anonymous`, and `error` states through `useAuth()`.

## Guards

```svelte
<RequireAuth redirectTo="/">
	<RequireAccess policy={{ permission: 'project.read' }} redirectTo="/forbidden">
		<ProjectPage />
	</RequireAccess>
</RequireAuth>

<Show policy={{ permissions: ['project.edit', 'project.delete'], mode: 'any' }}>
	<ProjectActions />
</Show>
```

Permissions are read from the active tenant membership. Super-administrator and tenant-administrator checks are deliberately separate, and the browser checks never replace backend authorization.

`RequireAuth` and `RequireAccess` accept a `feedback` object with optional `loading`, `error`, and `fallback` snippets. `RequireAuth` uses the fallback for an anonymous state; `RequireAccess` uses it for a forbidden state when no redirect is configured.

## Session actions

`useAuth()` provides `login`, `loginSuperAdministrator`, `register`, `acceptInvitation`, `logout`, `switchTenant`, `refresh`, and `continueAfterLogin`.
