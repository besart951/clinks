import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { ApiError } from './errors.ts';

/** Loopback, private, link-local, carrier-grade NAT and unspecified ranges: never reachable through a tenant's URL. */
const internal = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.168.0.0', 16],
] as const)
	internal.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
	['::', 128],
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
] as const)
	internal.addSubnet(network, prefix, 'ipv6');

export function isInternalAddress(address: string): boolean {
	// IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it carries. A ::ffff:0:0/96 rule would
	// not do: Node matches every plain IPv4 address against it.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.[1];
	if (mapped) return isInternalAddress(mapped);
	const family = isIP(address);
	return family === 4 ? internal.check(address, 'ipv4') : family === 6 ? internal.check(address, 'ipv6') : true;
}

/**
 * Tenants enter their own S3 endpoint, which the API then calls. So that this cannot reach services inside the
 * network (SSRF), the endpoint must use HTTPS and every address its host resolves to must be public. Development
 * allows internal hosts for the local RustFS.
 */
export type ResolveHost = (host: string) => Promise<string[]>;

async function systemResolve(host: string) {
	return (await lookup(host, { all: true })).map((entry) => entry.address);
}

export async function assertPublicEndpoint(
	endpoint: string,
	allowInternal: boolean,
	resolve: ResolveHost = systemResolve,
) {
	if (allowInternal) return;
	const url = new URL(endpoint);
	if (url.protocol !== 'https:') throw new ApiError(400, 'error.validation', { endpoint: 'error.ws.storage_endpoint' });
	const host = url.hostname.replace(/^\[|\]$/gu, '');
	const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
	if (addresses.length === 0)
		throw new ApiError(400, 'error.validation', { endpoint: 'ui.ws.storage.problem_unreachable' });
	if (addresses.some(isInternalAddress))
		throw new ApiError(400, 'error.validation', { endpoint: 'error.ws.storage_endpoint_internal' });
}
