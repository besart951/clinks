import { onMount } from 'svelte';
import { Resource } from '../../state/resource.svelte.ts';
import type { UserId } from '@clinks/domain/ids';
import type { Workspace } from '../../workspace.svelte.ts';

export interface Person {
	id: UserId;
	name: string;
	email: string;
	avatarColor: string;
	avatarDataUrl: string | null;
	jobTitle: string;
}

/** Staff of the active tenant, including updates arriving after the screen opens. */
export class PeopleDirectory {
	readonly #resource: Resource<Person[]>;
	constructor(workspace: Workspace) {
		this.#resource = new Resource(workspace.db, ['users', 'memberships'], () => workspace.api.people());
		onMount(() => this.#resource.connect());
	}
	get people(): Person[] {
		return this.#resource.data ?? [];
	}

	get(id: string | null | undefined): Person | undefined {
		return this.people.find((person) => person.id === id);
	}

	get byId(): Map<string, Person> {
		return new Map(this.people.map((person) => [person.id, person]));
	}
}
