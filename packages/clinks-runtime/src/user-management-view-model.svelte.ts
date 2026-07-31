import type { UserAdminService, UserSummary, UserDetail } from '@clinks/api-client';
import { QueryState } from './query-state.svelte.ts';
import { SearchableViewModel } from './searchable-view-model.svelte.ts';

export class UserManagementViewModel {
	list: SearchableViewModel<UserSummary, { role: string }>;
	detail = new QueryState<UserDetail>();

	#service: UserAdminService;

	constructor(service: UserAdminService) {
		this.#service = service;
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
		);
	}

	async load() {
		await this.list.refresh();
	}

	async openDetail(userId: string) {
		await this.detail.execute(() => this.#service.getUser(userId));
	}

	closeDetail() {
		this.detail.reset();
	}

	clear() {
		this.list.items = [];
		this.detail.reset();
	}
}
