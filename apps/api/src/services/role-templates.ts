import type { Tx } from '@clinks/db/scope';
import { roleAvailable, templateFor, templatesFor } from '@clinks/domain/products';
import type { ModuleKey, PlanCode } from '@clinks/domain/types';
import { uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';

async function entitlements(tx: Tx, tenantId: string) {
	const tenant = await tx
		.selectFrom('tenants')
		.select(['plan', 'enabledModules', 'locale'])
		.where('id', '=', tenantId)
		.executeTakeFirstOrThrow();
	return { ...tenant, plan: tenant.plan as PlanCode, enabledModules: tenant.enabledModules as ModuleKey[] };
}

/** Adds the role templates of the workspace's booked products that it does not have yet; run after modules change. */
export async function addRoleTemplates(tx: Tx, tenantId: string) {
	const tenant = await entitlements(tx, tenantId);
	const templates = templatesFor(tenant.enabledModules);
	if (templates.length === 0) return;
	const existing = await tx
		.selectFrom('roles')
		.select('template')
		.where('tenantId', '=', tenantId)
		.where('template', 'is not', null)
		.execute();
	const have = new Set(existing.map((row) => row.template));
	const missing = templates.filter((template) => !have.has(template.key));
	if (missing.length === 0) return;
	const locale = tenant.locale === 'en-US' ? 'en-US' : 'de-CH';
	await tx
		.insertInto('roles')
		.values(
			missing.map((template) => ({
				id: uuid(),
				tenantId,
				name: template.name[locale],
				kind: 'custom' as const,
				permissions: [...template.permissions],
				template: template.key,
			})),
		)
		// A role of the same name made by the workspace keeps its name; the template is simply not added.
		.onConflict((conflict) => conflict.doNothing())
		.execute();
}

/** A template role cannot be given to anyone while its product is not booked. */
export async function assertRoleAvailable(tx: Tx, tenantId: string, role: { template: string | null }) {
	if (!templateFor(role.template)) return;
	if (!roleAvailable(role, await entitlements(tx, tenantId))) throw new ApiError(409, 'error.ws.role_unavailable');
}
