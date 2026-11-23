import type { StorageSettingsId } from './ids.ts';
import type { ModuleKey, TenantRecord, Timestamp } from './types.ts';

/**
 * Where a tenant's documents are stored. `clinks` is the storage CLinks runs in Switzerland; the others are an
 * S3-compatible bucket the tenant owns and connects with its own keys.
 */
export const storageProviders = ['clinks', 'infomaniak', 'cloudflare', 'custom'] as const;
export type StorageProvider = (typeof storageProviders)[number];

/** Where the provider keeps the data; documents with health data must stay in Switzerland. */
export type DataLocation = 'switzerland' | 'eu' | 'unknown';

export type R2Jurisdiction = 'default' | 'eu';

/** Infomaniak Public Cloud S3 endpoints; the region is required for AWS Signature V4 and needs path-style URLs. */
export const infomaniakRegions = [
	{ region: 'dc3-a', endpoint: 'https://s3.pub1.infomaniak.cloud' },
	{ region: 'dc4-a', endpoint: 'https://s3.pub2.infomaniak.cloud' },
] as const;

/** Modules whose documents hold health data. */
const healthModules: readonly ModuleKey[] = ['physio', 'spitex'];

export interface StorageConnection {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	pathStyle: boolean;
}

export interface StorageCheck {
	at: Timestamp;
	ok: boolean;
}

/** One row per tenant. The secret never leaves the server; clients only see `StorageSettingsView`. */
export interface StorageSettings extends TenantRecord<StorageSettingsId>, StorageConnection {
	provider: StorageProvider;
	secretAccessKey: string;
	/** Set when an administrator confirmed storing health data outside Switzerland. */
	locationAcknowledgedAt: Timestamp | null;
	lastCheck: StorageCheck | null;
}

export interface StorageSettingsView extends Omit<StorageSettings, 'secretAccessKey'> {
	/** The last four characters of the stored secret, or null if none is stored. */
	secretHint: string | null;
}

/** What an administrator submits; an empty `secretAccessKey` keeps the stored one. */
export interface StorageSettingsInput extends StorageConnection {
	provider: StorageProvider;
	secretAccessKey: string;
	acknowledgeLocation: boolean;
}

export function r2Endpoint(accountId: string, jurisdiction: R2Jurisdiction): string {
	const host = jurisdiction === 'eu' ? 'eu.r2.cloudflarestorage.com' : 'r2.cloudflarestorage.com';
	return `https://${accountId.trim().toLowerCase()}.${host}`;
}

/** Reads the account id and jurisdiction back out of an R2 endpoint, or null if it is not one. */
export function parseR2Endpoint(endpoint: string): { accountId: string; jurisdiction: R2Jurisdiction } | null {
	const match = /^https:\/\/([a-f0-9]{32})\.(eu\.)?r2\.cloudflarestorage\.com\/?$/.exec(endpoint.trim());
	return match ? { accountId: match[1], jurisdiction: match[2] ? 'eu' : 'default' } : null;
}

export function dataLocation(provider: StorageProvider, endpoint: string): DataLocation {
	switch (provider) {
		case 'clinks':
		case 'infomaniak':
			return 'switzerland';
		case 'cloudflare':
			return parseR2Endpoint(endpoint)?.jurisdiction === 'eu' ? 'eu' : 'unknown';
		case 'custom':
			return 'unknown';
	}
}

/** Health data outside Switzerland needs an explicit confirmation from the tenant. */
export function needsLocationConsent(location: DataLocation, enabledModules: readonly ModuleKey[]): boolean {
	return location !== 'switzerland' && enabledModules.some((module) => healthModules.includes(module));
}

/** The connection fields a provider needs; CLinks storage needs none. */
export function connectionDefaults(provider: StorageProvider): StorageConnection {
	switch (provider) {
		case 'infomaniak':
			return { ...infomaniakRegions[0], bucket: '', accessKeyId: '', pathStyle: true };
		case 'cloudflare':
			return { endpoint: '', region: 'auto', bucket: '', accessKeyId: '', pathStyle: false };
		case 'clinks':
		case 'custom':
			return { endpoint: '', region: '', bucket: '', accessKeyId: '', pathStyle: true };
	}
}
