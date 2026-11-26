import { moduleBooked, permissionAreas } from './permissions.ts';
import { coreModules, type ModuleKey, type Permission, type Tenant } from './types.ts';

/** What a customer books: the basics, plan modules, industry products, and the administration every workspace has. */
export const productKeys = ['core', 'planner', 'mail', 'finance', 'spitex', 'physio', 'admin'] as const;
export type ProductKey = (typeof productKeys)[number];

export interface RoleTemplate {
	/** Kept on the role, so it can be reset and hidden with its product. */
	key: string;
	product: ProductKey;
	name: { 'de-CH': string; 'en-US': string };
	permissions: readonly Permission[];
}

export interface Product {
	key: ProductKey;
	/** `always`: in every workspace; `plan`: with the plan or booked; `addon`: booked on its own. */
	availability: 'always' | 'plan' | 'addon';
	modules: readonly ModuleKey[];
	permissions: readonly Permission[];
	templates: readonly RoleTemplate[];
}

const basics: readonly Permission[] = [
	'contacts.read',
	'contacts.write',
	'calendar.read',
	'calendar.write',
	'documents.read',
	'documents.write',
];

export const products: readonly Product[] = [
	{
		key: 'core',
		availability: 'always',
		modules: coreModules,
		permissions: basics,
		templates: [],
	},
	{
		key: 'planner',
		availability: 'plan',
		modules: ['planner'],
		permissions: ['planner.read', 'planner.write'],
		templates: [],
	},
	{ key: 'mail', availability: 'plan', modules: ['mail'], permissions: ['mail.read', 'mail.write'], templates: [] },
	{
		key: 'finance',
		availability: 'plan',
		modules: ['finance'],
		permissions: ['finance.read', 'finance.write'],
		templates: [],
	},
	{
		key: 'spitex',
		availability: 'addon',
		modules: ['spitex'],
		permissions: ['spitex.read', 'spitex.write', 'spitex.own.read', 'spitex.release'],
		templates: [
			{
				key: 'spitex.lead',
				product: 'spitex',
				name: { 'de-CH': 'Spitex-Leitung', 'en-US': 'Home care lead' },
				permissions: [...basics, 'planner.read', 'planner.write', 'spitex.read', 'spitex.write', 'spitex.release'],
			},
			{
				key: 'spitex.planning',
				product: 'spitex',
				name: { 'de-CH': 'Spitex-Planung', 'en-US': 'Home care planning' },
				permissions: [
					'contacts.read',
					'contacts.write',
					'calendar.read',
					'calendar.write',
					'documents.read',
					'spitex.read',
					'spitex.write',
					'spitex.release',
				],
			},
			{
				key: 'spitex.care',
				product: 'spitex',
				name: { 'de-CH': 'Spitex-Pflege', 'en-US': 'Home care staff' },
				permissions: ['spitex.own.read'],
			},
		],
	},
	{
		key: 'physio',
		availability: 'addon',
		modules: ['physio'],
		permissions: ['physio.read', 'physio.write'],
		templates: [
			{
				key: 'physio.lead',
				product: 'physio',
				name: { 'de-CH': 'Physio-Leitung', 'en-US': 'Practice lead' },
				permissions: [...basics, 'planner.read', 'planner.write', 'physio.read', 'physio.write'],
			},
			{
				key: 'physio.therapy',
				product: 'physio',
				name: { 'de-CH': 'Physiotherapie', 'en-US': 'Physiotherapist' },
				permissions: [...basics, 'physio.read', 'physio.write'],
			},
			{
				key: 'physio.reception',
				product: 'physio',
				name: { 'de-CH': 'Physio-Empfang', 'en-US': 'Reception' },
				permissions: ['contacts.read', 'contacts.write', 'calendar.read', 'calendar.write', 'documents.read'],
			},
		],
	},
	{
		key: 'admin',
		availability: 'always',
		modules: [],
		permissions: ['team.manage', 'roles.manage', 'billing.manage', 'settings.manage', 'audit.read'],
		templates: [],
	},
];

export function productFor(key: ProductKey): Product {
	return products.find((product) => product.key === key)!;
}

/** The product a right belongs to. */
export function productOf(permission: Permission): ProductKey {
	return products.find((product) => product.permissions.includes(permission))!.key;
}

export function templateFor(key: string | null | undefined): RoleTemplate | null {
	if (!key) return null;
	return products.flatMap((product) => product.templates).find((template) => template.key === key) ?? null;
}

/** Whether the workspace has the product: the basics and administration always, the rest when booked and on. */
export function productBooked(tenant: Pick<Tenant, 'plan' | 'enabledModules'>, key: ProductKey): boolean {
	const product = productFor(key);
	if (product.availability === 'always') return true;
	return product.modules.every((module) => moduleBooked(tenant, module));
}

/** Templates of the booked products, for a workspace with these modules. */
export function templatesFor(modules: readonly ModuleKey[]): RoleTemplate[] {
	return products
		.filter((product) => product.availability !== 'always' && product.modules.every((m) => modules.includes(m)))
		.flatMap((product) => product.templates);
}

/** A template role stays hidden and unassignable while its product is not booked. */
export function roleAvailable(
	role: { template?: string | null },
	tenant: Pick<Tenant, 'plan' | 'enabledModules'>,
): boolean {
	const template = templateFor(role.template);
	return !template || productBooked(tenant, template.product);
}

/** The role matrix in sections: the basics, one per product, then administration. */
export function rightGroups(): { product: ProductKey; areas: ReturnType<typeof permissionAreas> }[] {
	const areas = permissionAreas();
	return products.map((product) => ({
		product: product.key,
		areas: areas.filter((area) => productOf((area.read ?? area.write)!) === product.key),
	}));
}

/** Products whose rights a role holds although the workspace has not booked them: those rights rest. */
export function dormantProducts(
	permissions: readonly Permission[],
	tenant: Pick<Tenant, 'plan' | 'enabledModules'>,
): ProductKey[] {
	return [...new Set(permissions.map(productOf))].filter((key) => !productBooked(tenant, key));
}
