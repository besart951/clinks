import type { UserAdminService, UserSummary, UserDetail } from '@clinks/api-client';
import { QueryState } from './query-state.svelte.ts';
import { SearchableViewModel } from './searchable-view-model.svelte.ts';
import type { ErrorMessageFormatter } from './error-handler.ts';

export class UserManagementViewModel {
	list: SearchableViewModel<UserSummary, { role: string }>;
	detail: QueryState<UserDetail>;

	#service: UserAdminService;

	constructor(service: UserAdminService, messages: ErrorMessageFormatter) {
		this.#service = service;
		this.detail = new QueryState<UserDetail>(messages);
		this.list = new SearchableViewModel<UserSummary, { role: string }>(
			(params) =>
				this.#service
					.listUsers({
						search: params.search || undefined,
						role: params.filters.role || undefined,
						cursor: params.cursor || undefined,
						pageSize: 20,
					})
					.then((page) => ({ items: page.users, nextCursor: page.nextCursor })),
			{ role: '' },
			messages,
		);
	}

	async load() {
		await this.list.refresh();
	}

	async openDetail(userId: string) {
		await this.detail.execute(userId, () => this.#service.getUser(userId));
	}

	closeDetail() {
		this.detail.reset();
	}

	clear() {
		this.list.items = [];
		this.detail.reset();
	}
}
