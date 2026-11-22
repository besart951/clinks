# Code style

## Svelte 5 and Tailwind

- Use Svelte 5 runes: `$state` and `$derived`; reserve `$effect` for external non-reactive integrations only.
- Put shared controls in `packages/ui`. Apps do not keep local error translation maps.
- Use Tailwind utility classes and accessible labels, inputs, and live regions.
- API errors arrive already localized; screens render them verbatim and keep no local error translation maps.
- **Test Directory Separation:** Do NOT write test files in the same folder as production code. Separate tests into a dedicated `test/` directory (keeping `src/` strictly for production code).

### Svelte 5 State & Effect Best Practices

- **Do NOT use `$effect` for state synchronization or derived values:**
  - Use `$derived` or `$derived.by()` for computed values (e.g., reading URL search params or fallback values).
  - Use explicit event handlers (e.g., `onchange`, `onclick`) to trigger async actions or state mutations instead of watching state via `$effect`.
  - Keep `$effect` exclusively for DOM measurements, external non-reactive integrations, or third-party library cleanups.
- **Single Responsibility Principle (SRP):**
  - Split large monolithic views into focused, fine-grained components (e.g., isolate authentication forms, tenant switchers, and admin panels into separate `.svelte` files).
  - Avoid bloat: single components should not hold more than 5–8 reactive state variables.

### Object-Oriented Programming (OOP) & Domain Classes

- **Class-based State Management:**
  - Encapsulate complex feature logic, multi-step forms, and API interactions inside OOP TypeScript classes (e.g., `AuthViewModel`, `TenantController`).
  - Use Svelte 5 runes inside class fields to make class state natively reactive:

    ```ts
    export class AuthViewModel {
    	email = $state('');
    	password = $state('');
    	busy = $state(false);
    	errorMessage = $state('');

    	constructor(private client: ApiClient) {}

    	async submit() {
    		this.busy = true;
    		this.errorMessage = '';
    		try {
    			// domain logic
    		} finally {
    			this.busy = false;
    		}
    	}
    }
    ```

- **Avoid Long Parameter Lists (Props Bloat):**
  - Do not pass more than **3 to 4 individual props** to a component or function.
  - If a component requires multiple related fields (e.g., user details, form state, configuration), group them into a single typed object or domain class using the **Parameter Object Pattern**.
  - Prefer passing a cohesive object domain entity over destructured scalar values (e.g., pass `user: UserProfile` instead of `name`, `email`, `role`, `avatarUrl`, `isPending`).
- **Domain Models & Services:**
  - Treat business logic as domain entities/services with methods rather than scattering raw `async` functions across `.svelte` files.
  - Instanciate view models in component script blocks via `$state` or context (`setContext` / `getContext`).
- **Function & Method Syntax:**
  - Prefer standard function declarations and method syntax (`function name() {}` or `async methodName() {}`) over arrow function property assignments (`const name = () => {}` or `methodName = async () => {}`).
  - Use arrow functions primarily for short inline callbacks or preserving outer `this` bindings when passing inline event listeners.

- Use always Shadcn-Ui componet if not installed, install it. in check always first in `packages\ui\src\lib\components\ui`
- text should always have translation

## Protobuf

- Use a versioned package name (clinks.v1), UUID strings for identifiers, and human-readable localized messages in errors.
- Generate Protobuf and Connect bindings with `buf generate`; never hand-edit generated code.
