import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const state = (value: unknown) => value;
state.raw = state;
(globalThis as any).$state ??= state;

import { AuthAccessViewModel } from '../src/auth-access-view-model.svelte.ts';

describe('AuthAccessViewModel', () => {
	it('submits the selected credential flow and continues after authentication', async () => {
		const calls: string[] = [];
		const session = {
			async login() {
				calls.push('login');
			},
			async register() {
				calls.push('register');
			},
			async acceptInvitation() {
				calls.push('invite');
			},
		};
		const model = new AuthAccessViewModel(session, { message: () => 'localized' }, async () => {
			calls.push('continue');
		});

		await model.login();
		await model.register();
		await model.acceptInvitation('token');

		assert.deepEqual(calls, ['login', 'continue', 'register', 'continue', 'invite', 'continue']);
	});

	it('renders the backend-provided localized error through the message formatter', async () => {
		const session = {
			async login() {
				throw new Error('private detail');
			},
			async register() {},
			async acceptInvitation() {},
		};
		const model = new AuthAccessViewModel(session, { message: () => 'Öffentliche Meldung' }, async () => {});

		await model.login();

		assert.equal(model.errorMessage, 'Öffentliche Meldung');
		assert.equal(model.busy, false);
	});
});
