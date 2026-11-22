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

/** Staff of the active tenant, loaded once per screen for assignees, mentions and avatars. */
export class PeopleDirectory {
	people = $state.raw<Person[]>([]);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	async load() {
		try {
			this.people = await this.#workspace.api.people();
		} catch {
			this.people = [];
		}
	}

	get(id: string | null | undefined): Person | undefined {
		return this.people.find((person) => person.id === id);
	}

	get byId(): Map<string, Person> {
		return new Map(this.people.map((person) => [person.id, person]));
	}
}
