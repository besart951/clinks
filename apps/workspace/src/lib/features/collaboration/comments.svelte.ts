import type { Comment, CommentTarget } from '../../domain/types.ts';
import type { UserId } from '../../domain/ids.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import type { Person } from './people.svelte.ts';

/** Finds `@Name` mentions of known people in a comment. */
export function mentionedPeople(body: string, people: readonly Person[]): UserId[] {
	return people.filter((person) => body.includes(`@${person.name}`)).map((person) => person.id);
}

/** Comments on one record, with @mentions that notify the people named. */
export class CommentThreadModel {
	readonly resource: Resource<Comment[]>;
	draft = $state('');
	busy = $state(false);
	#workspace: Workspace;
	#target: CommentTarget;
	#label: string;
	#path: string;

	constructor(workspace: Workspace, target: CommentTarget, context: { label: string; path: string }) {
		this.#workspace = workspace;
		this.#target = target;
		this.#label = context.label;
		this.#path = context.path;
		this.resource = new Resource(workspace.db, ['comments'], async () =>
			(await workspace.api.comments.list((row) => row.target.kind === target.kind && row.target.id === target.id)).sort((left, right) =>
				left.createdAt.localeCompare(right.createdAt),
			),
		);
	}

	async post(people: readonly Person[]) {
		const body = this.draft.trim();
		if (!body) return;
		this.busy = true;
		const mentions = mentionedPeople(body, people);
		const author = this.#workspace.session.user!;
		const created = await this.#workspace.run(async () => {
			const comment = await this.#workspace.api.comments.create({ target: this.#target, authorId: author.id, body, mentions });
			if (mentions.length > 0) {
				await this.#workspace.api.notify(
					mentions,
					'mention',
					{ key: 'ui.ws.notification.mentioned', params: { name: `${author.firstName} ${author.lastName}`, target: this.#label } },
					this.#path,
				);
			}
			return comment;
		});
		if (created) this.draft = '';
		this.busy = false;
	}

	async remove(comment: Comment) {
		const api = this.#workspace.api.comments;
		await this.#workspace.run(() => api.remove(comment.id), { success: 'ui.ws.comments.deleted', undo: () => api.restore(comment) });
	}
}
