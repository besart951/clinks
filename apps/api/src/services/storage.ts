import { storageSettingsSchema } from '@clinks/contracts/schemas';
import type { StorageConfigTable } from '@clinks/db/schema';
import { inScope, type Tx } from '@clinks/db/scope';
import {
	dataLocation,
	needsLocationConsent,
	type StorageCheck,
	type StorageSettingsInput,
	type StorageSettingsView,
} from '@clinks/domain/storage';
import type { ModuleKey } from '@clinks/domain/types';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import type { Selectable } from 'kysely';
import { uuid } from '../crypto.ts';
import { ApiError, forbidden } from '../errors.ts';
import { ObjectStore } from '../object-store.ts';
import { assertPublicEndpoint, publicAgent } from '../endpoint-guard.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Services } from './context.ts';
import { requirePermission } from './permissions.ts';

type StorageRow = Selectable<StorageConfigTable>;

/**
 * Picks the bucket for a tenant: its own active bucket, or CLinks storage. Rows never change their
 * connection after saving, so an opened client is cached by row id.
 */
export class TenantStores {
	readonly #services: Services;
	readonly #cache = new Map<string, ObjectStore>();

	constructor(services: Services) {
		this.#services = services;
	}

	/** Where new versions go: the tenant's active bucket, or CLinks storage (null id). */
	async active(tx: Tx, tenantId: string): Promise<{ store: ObjectStore | undefined; storageId: string | null }> {
		const row = await tx
			.selectFrom('auth.storageConfigs')
			.selectAll()
			.where('tenantId', '=', tenantId)
			.where('active', '=', true)
			.executeTakeFirst();
		return row
			? { store: await this.open(row), storageId: row.id }
			: { store: this.#services.objects, storageId: null };
	}

	/** Where an existing version lives. */
	async of(tx: Tx, storageId: string | null): Promise<ObjectStore | undefined> {
		if (storageId === null) return this.#services.objects;
		const row = await tx.selectFrom('auth.storageConfigs').selectAll().where('id', '=', storageId).executeTakeFirst();
		if (!row) throw new ApiError(404, 'error.ws.not_found');
		return this.open(row);
	}

	async open(row: StorageRow): Promise<ObjectStore> {
		const cached = this.#cache.get(row.id);
		if (cached) return cached;
		// Checked again before use: the host's addresses may have changed since it was saved.
		const allowInternal = this.#services.config.STORAGE_ALLOW_INTERNAL === true;
		await assertPublicEndpoint(row.endpoint, allowInternal, this.#services.resolveHost);
		let secretAccessKey: string;
		try {
			secretAccessKey = await this.#services.secrets.open(row.secretCiphertext, row.tenantId);
		} catch {
			// The encryption key changed (or is ephemeral in development): the secret has to be entered again.
			throw new ApiError(503, 'error.ws.storage_secret');
		}
		const store = new ObjectStore({
			bucket: row.bucket,
			endpoint: row.endpoint,
			region: row.region,
			pathStyle: row.pathStyle,
			credentials: { accessKeyId: row.accessKeyId, secretAccessKey },
			httpsAgent: allowInternal ? undefined : publicAgent(),
		});
		this.#cache.set(row.id, store);
		return store;
	}
}

const stores = new WeakMap<Services, TenantStores>();

/** One TenantStores per service set, so cached clients are shared between requests. */
export function tenantStores(services: Services): TenantStores {
	let found = stores.get(services);
	if (!found) {
		found = new TenantStores(services);
		stores.set(services, found);
	}
	return found;
}

function view(row: StorageRow): StorageSettingsView {
	return {
		id: row.id as StorageSettingsView['id'],
		tenantId: row.tenantId as StorageSettingsView['tenantId'],
		revision: 1,
		createdAt: new Date(row.createdAt).toISOString(),
		updatedAt: new Date(row.updatedAt).toISOString(),
		provider: row.provider,
		endpoint: row.endpoint,
		region: row.region,
		bucket: row.bucket,
		accessKeyId: row.accessKeyId,
		pathStyle: row.pathStyle,
		locationAcknowledgedAt: row.locationAcknowledgedAt ? new Date(row.locationAcknowledgedAt).toISOString() : null,
		lastCheck: row.lastCheckAt ? { at: new Date(row.lastCheckAt).toISOString(), ok: row.lastCheckOk === true } : null,
		secretHint: row.secretHint,
	};
}

/** A tenant's document storage: read, change (secrets stay encrypted, write-only) and check the connection. */
export class StorageService {
	readonly #services: Services;

	constructor(services: Services) {
		this.#services = services;
	}

	#tenant<T>(claims: AccessClaims, work: (tx: Tx, tenantId: string) => Promise<T>) {
		const tenantId = claims.tenant_id;
		if (!tenantId) throw forbidden();
		return inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			await requirePermission(tx, tenantId, claims.sub, 'settings.manage');
			return work(tx, tenantId);
		});
	}

	#active(tx: Tx, tenantId: string) {
		return tx
			.selectFrom('auth.storageConfigs')
			.selectAll()
			.where('tenantId', '=', tenantId)
			.where('active', '=', true)
			.executeTakeFirst();
	}

	get(claims: AccessClaims): Promise<StorageSettingsView | null> {
		return this.#tenant(claims, async (tx, tenantId) => {
			const row = await this.#active(tx, tenantId);
			return row ? view(row) : null;
		});
	}

	/** Saving adds a new row: versions already stored keep pointing at the bucket they were written to. */
	save(claims: AccessClaims, input: StorageSettingsInput): Promise<StorageSettingsView | null> {
		return this.#tenant(claims, async (tx, tenantId) => {
			const tenant = await tx
				.selectFrom('tenants')
				.select('enabledModules')
				.where('id', '=', tenantId)
				.forUpdate()
				.executeTakeFirstOrThrow();
			const current = await this.#active(tx, tenantId);
			const deactivate = () =>
				tx
					.updateTable('auth.storageConfigs')
					.set({ active: false, updatedAt: new Date() })
					.where('tenantId', '=', tenantId)
					.where('active', '=', true)
					.execute();
			const record = () =>
				audit(tx, { tenantId, actorId: claims.sub, action: 'tenant.storage_changed', target: tenantId }, null);
			if (input.provider === 'clinks') {
				await deactivate();
				await record();
				return null;
			}
			// A stored secret belongs to one access key on one provider; anything else needs the secret again.
			const keepsSecret =
				current !== undefined &&
				current.provider === input.provider &&
				current.accessKeyId === input.accessKeyId.trim();
			const consent = needsLocationConsent(
				dataLocation(input.provider, input.endpoint),
				tenant.enabledModules as ModuleKey[],
			);
			const allowInternal = this.#services.config.STORAGE_ALLOW_INTERNAL === true;
			const checked = storageSettingsSchema({
				requireSecret: !keepsSecret,
				requireAcknowledgement: consent,
				allowHttp: allowInternal,
			}).safeParse(input);
			if (!checked.success) {
				const fields: { [field: string]: ProductTranslationKey } = {};
				for (const issue of checked.error.issues)
					fields[issue.path.join('.') || 'body'] ??= (
						issue.message.startsWith('error.') ? issue.message : 'error.ws.required'
					) as ProductTranslationKey;
				throw new ApiError(400, 'error.validation', fields);
			}
			await assertPublicEndpoint(input.endpoint.trim(), allowInternal, this.#services.resolveHost);
			const secret = input.secretAccessKey
				? {
						secretCiphertext: await this.#services.secrets.seal(input.secretAccessKey, tenantId),
						secretHint: input.secretAccessKey.slice(-4),
					}
				: { secretCiphertext: current!.secretCiphertext, secretHint: current!.secretHint };
			await deactivate();
			const row = await tx
				.insertInto('auth.storageConfigs')
				.values({
					id: uuid(),
					tenantId,
					provider: input.provider,
					endpoint: input.endpoint.trim().replace(/\/$/u, ''),
					region: input.region.trim(),
					bucket: input.bucket.trim(),
					accessKeyId: input.accessKeyId.trim(),
					...secret,
					pathStyle: input.pathStyle,
					locationAcknowledgedAt: consent ? (current?.locationAcknowledgedAt ?? new Date()) : null,
					createdBy: claims.sub,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
			await record();
			return view(row);
		});
	}

	/** Writes, reads and removes a probe object in the active bucket and records the outcome. */
	test(claims: AccessClaims): Promise<StorageCheck> {
		return this.#tenant(claims, async (tx, tenantId) => {
			const row = await this.#active(tx, tenantId);
			const at = new Date();
			if (!row) {
				const problems = this.#services.objects
					? await this.#services.objects.check(this.#services.config.WEB_ORIGIN)
					: (['unreachable'] as const);
				return { at: at.toISOString(), ok: problems.length === 0, problems: [...problems] };
			}
			let problems: StorageCheck['problems'];
			try {
				problems = await (await tenantStores(this.#services).open(row)).check(this.#services.config.WEB_ORIGIN);
			} catch (error) {
				if (!(error instanceof ApiError)) throw error;
				problems = ['secret'];
			}
			await tx
				.updateTable('auth.storageConfigs')
				.set({ lastCheckAt: at, lastCheckOk: problems.length === 0 })
				.where('id', '=', row.id)
				.execute();
			return { at: at.toISOString(), ok: problems.length === 0, problems };
		});
	}
}
