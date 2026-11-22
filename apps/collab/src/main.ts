import { createDb } from '@clinks/db/client';
import { inScope } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import type { Permission } from '@clinks/domain/types';
import { Database } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const env = z
	.object({
		DATABASE_URL: z.url(),
		JWKS_URL: z.url(),
		TOKEN_ISSUER: z.string(),
		TOKEN_AUDIENCE: z.string().default('clinks'),
		PORT: z.coerce.number().int().default(1234),
	})
	.parse(process.env);
const db = createDb(env.DATABASE_URL);
const keys = createRemoteJWKSet(new URL(env.JWKS_URL));
const claims = z.object({ sub: z.uuid(), tenant_id: z.uuid(), sid: z.uuid(), exp: z.number() });
type Identity = z.infer<typeof claims>;

async function access(identity: Identity) {
	if (identity.exp * 1000 <= Date.now()) throw Error('expired');
	return inScope(db, { tenantId: identity.tenant_id, userId: identity.sub }, async (tx) => {
		const role = await tx
			.selectFrom('memberships')
			.innerJoin('roles', 'roles.id', 'memberships.roleId')
			.innerJoin('tenants', 'tenants.id', 'memberships.tenantId')
			.select(['roles.kind', 'roles.permissions', 'tenants.enabledModules'])
			.where('memberships.status', '=', 'active')
			.where('memberships.userId', '=', identity.sub)
			.where('memberships.tenantId', '=', identity.tenant_id)
			.executeTakeFirst();
		const session = await tx
			.selectFrom('auth.refreshTokens')
			.select('id')
			.where('familyId', '=', identity.sid)
			.where('userId', '=', identity.sub)
			.where('revokedAt', 'is', null)
			.where('expiresAt', '>', new Date())
			.executeTakeFirst();
		const current = role ? { kind: role.kind, permissions: role.permissions as Permission[] } : null;
		if (!role?.enabledModules.includes('planner') || !session || !roleGrants(current, 'planner.read'))
			throw Error('forbidden');
		return roleGrants(current, 'planner.write');
	});
}

const server = new Server<Identity>({
	port: env.PORT,
	stopOnSignals: false,
	async onAuthenticate({ token, documentName, connectionConfig }) {
		const { payload } = await jwtVerify(token, keys, {
			issuer: env.TOKEN_ISSUER,
			audience: env.TOKEN_AUDIENCE,
			algorithms: ['EdDSA'],
		});
		const identity = claims.parse(payload);
		if (documentName !== 'planner/' + identity.tenant_id) throw Error('forbidden');
		connectionConfig.readOnly = !(await access(identity));
		return identity;
	},
	async connected({ connection, context }) {
		const timer = setInterval(() => {
			void access(context)
				.then((write) => {
					connection.readOnly = !write;
				})
				.catch(() => connection.close());
		}, 15000);
		timer.unref();

		connection.onClose(() => {
			clearInterval(timer);
		});
	},
	async beforeHandleMessage({ context, connection }) {
		connection.readOnly = !(await access(context));
	},
	extensions: [
		new Database({
			async fetch({ context }) {
				const identity = claims.parse(context);
				return inScope(
					db,
					{ tenantId: identity.tenant_id, userId: identity.sub },
					async (tx) =>
						(
							await tx
								.selectFrom('planningRooms')
								.select('state')
								.where('tenantId', '=', identity.tenant_id)
								.executeTakeFirst()
						)?.state ?? null,
				);
			},
			async store({ state, lastContext }) {
				const identity = claims.parse(lastContext);
				await inScope(db, { tenantId: identity.tenant_id, userId: identity.sub }, async (tx) => {
					await tx
						.insertInto('planningRooms')
						.values({ tenantId: identity.tenant_id, state })
						.onConflict((c) => c.column('tenantId').doUpdateSet({ state, updatedAt: new Date() }))
						.execute();
				});
			},
		}),
	],
});
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.once(signal, async () => {
		await server.destroy();
		await db.destroy();
	});
