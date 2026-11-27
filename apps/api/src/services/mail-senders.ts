import type { Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import type { Permission, RoleKind } from '@clinks/domain/types';
import { uuid } from '../crypto.ts';
import type { Services } from './context.ts';
import { keyContext, recheckAfterMs, verifyDomain } from './mail-domains.ts';

/** A workspace address mails go out from; see Settings › E-Mail. */
export interface Sender {
	id: string;
	displayName: string;
	address: string;
	replyTo: string | null;
	signature: string;
}

const senderColumns = ['id', 'displayName', 'address', 'replyTo', 'signature'] as const;

/** The default business or newsletter sender, if the workspace set one up. */
export async function defaultSender(tx: Tx, kind: 'business' | 'newsletter'): Promise<Sender | null> {
	return (
		(await tx
			.selectFrom('mailSenders')
			.select(senderColumns)
			.where('kind', '=', kind)
			.where('isDefault', '=', true)
			.executeTakeFirst()) ?? null
	);
}

/**
 * How the worker sends a sender's mail: from the workspace's own address and DKIM-signed through the relay, or null
 * for the platform address (no relay, domain not verified, or it stopped verifying — then admins are told).
 */
export async function ownIdentity(tx: Tx, services: Services, senderId: string) {
	if (!services.relay) return null;
	const sender = await tx
		.selectFrom('mailSenders')
		.innerJoin('mailDomains', 'mailDomains.id', 'mailSenders.domainId')
		.select([
			'mailSenders.displayName',
			'mailSenders.address',
			'mailDomains.id as domainId',
			'mailDomains.domain',
			'mailDomains.selector',
			'mailDomains.dkimPublicKey',
			'mailDomains.status',
			'mailDomains.checkedAt',
		])
		.where('mailSenders.id', '=', senderId)
		.executeTakeFirst();
	if (!sender || sender.status !== 'verified') return null;
	const stale = !sender.checkedAt || services.now().getTime() - sender.checkedAt.getTime() > recheckAfterMs;
	if (stale) {
		const domain = { id: sender.domainId, domain: sender.domain, selector: sender.selector, status: sender.status };
		if (!(await verifyDomain(tx, services, { ...domain, dkimPublicKey: sender.dkimPublicKey }))) {
			await notifyAdmins(tx, services, 'ui.ws.notification.mail_domain_failing', { domain: sender.domain });
			return null;
		}
	}
	const key = await tx
		.selectFrom('auth.mailDomainKeys')
		.select('privateKeyCiphertext')
		.where('domainId', '=', sender.domainId)
		.executeTakeFirstOrThrow();
	return {
		from: { name: sender.displayName, address: sender.address },
		dkim: {
			domainName: sender.domain,
			keySelector: sender.selector,
			privateKey: await services.secrets.open(key.privateKeyCiphertext, keyContext(sender.domainId)),
		},
	};
}

/** An in-app notice for everyone who manages the workspace's settings. */
async function notifyAdmins(tx: Tx, services: Services, key: string, params: Record<string, string>) {
	const members = await tx
		.selectFrom('memberships')
		.innerJoin('roles', 'roles.id', 'memberships.roleId')
		.select(['memberships.userId', 'memberships.tenantId', 'roles.kind', 'roles.permissions'])
		.where('memberships.status', '=', 'active')
		.execute();
	const now = services.now();
	for (const member of members) {
		const role = { kind: member.kind as RoleKind, permissions: member.permissions as Permission[] };
		if (!roleGrants(role, 'settings.manage')) continue;
		await tx
			.insertInto('notifications')
			.values({
				id: uuid(),
				tenantId: member.tenantId,
				userId: member.userId,
				kind: 'system',
				message: JSON.stringify({ key, params }),
				href: '/settings/mail',
				isRead: false,
				revision: 1,
				createdAt: now,
				updatedAt: now,
			})
			.execute();
	}
}
