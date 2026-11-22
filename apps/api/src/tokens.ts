import {
	exportJWK,
	generateKeyPair,
	importJWK,
	jwtVerify,
	SignJWT,
	type JWK,
	type JWTPayload,
	type CryptoKey,
} from 'jose';

const algorithm = 'EdDSA';
export const accessTokenSeconds = 15 * 60;

/** What an access token says about its holder. PowerSync and Hocuspocus read the same claims. */
export interface AccessClaims {
	/** The user id. */
	sub: string;
	/** The active tenant, null before onboarding. */
	tenant_id: string | null;
	/** The role in the active tenant. */
	role: string | null;
	/** The signed-in device (refresh token family), so revoking it cuts off API access at once. */
	sid: string;
}

interface SigningKey {
	kid: string;
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	publicJwk: JWK;
}

/** Signs and verifies access tokens and publishes the public keys as JWKS. */
export class TokenService {
	readonly #issuer: string;
	readonly #audience: string;
	readonly #current: SigningKey;
	readonly #verifiers: Map<string, CryptoKey>;
	readonly #published: JWK[];

	private constructor(issuer: string, audience: string, current: SigningKey, previous: { jwk: JWK; key: CryptoKey }[]) {
		this.#issuer = issuer;
		this.#audience = audience;
		this.#current = current;
		this.#verifiers = new Map([[current.kid, current.publicKey]]);
		for (const { jwk, key } of previous) if (jwk.kid) this.#verifiers.set(jwk.kid, key);
		this.#published = [current.publicJwk, ...previous.map(({ jwk }) => jwk)];
	}

	static async create(options: {
		issuer: string;
		audience: string;
		/** Private Ed25519 JWK as JSON; a fresh key is generated when missing. */
		signingKey?: string;
		previousPublicKeys?: string;
	}): Promise<TokenService> {
		const current = options.signingKey ? await importSigningKey(options.signingKey) : await generateSigningKey();
		const previous = await Promise.all(
			(JSON.parse(options.previousPublicKeys ?? '[]') as JWK[]).map(async (jwk) => ({
				jwk: publicPart(jwk),
				key: (await importJWK(publicPart(jwk), algorithm)) as CryptoKey,
			})),
		);
		return new TokenService(options.issuer, options.audience, current, previous);
	}

	async issue(claims: AccessClaims, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
		const issuedAt = Math.floor(now.getTime() / 1000);
		const expiresAt = new Date((issuedAt + accessTokenSeconds) * 1000);
		const token = await new SignJWT({ tenant_id: claims.tenant_id, role: claims.role, sid: claims.sid })
			.setProtectedHeader({ alg: algorithm, kid: this.#current.kid, typ: 'JWT' })
			.setSubject(claims.sub)
			.setIssuer(this.#issuer)
			.setAudience(this.#audience)
			.setIssuedAt(issuedAt)
			.setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
			.sign(this.#current.privateKey);
		return { token, expiresAt };
	}

	/** Throws for a bad signature, an unknown key, another issuer or audience, or an expired token. */
	async verify(token: string, now = new Date()): Promise<AccessClaims> {
		const { payload } = await jwtVerify(
			token,
			async (header) => {
				const key = header.kid ? this.#verifiers.get(header.kid) : undefined;
				if (!key) throw new Error('unknown signing key');
				return key;
			},
			{ algorithms: [algorithm], issuer: this.#issuer, audience: this.#audience, currentDate: now },
		);
		return claimsFrom(payload);
	}

	jwks(): { keys: JWK[] } {
		return { keys: this.#published };
	}
}

function claimsFrom(payload: JWTPayload): AccessClaims {
	const { sub, tenant_id, role, sid } = payload as JWTPayload & Partial<AccessClaims>;
	if (typeof sub !== 'string' || typeof sid !== 'string') throw new Error('incomplete token');
	return {
		sub,
		sid,
		tenant_id: typeof tenant_id === 'string' ? tenant_id : null,
		role: typeof role === 'string' ? role : null,
	};
}

function publicPart(jwk: JWK): JWK {
	const { kty, crv, x, kid } = jwk;
	return { kty, crv, x, kid, alg: algorithm, use: 'sig' };
}

async function importSigningKey(json: string): Promise<SigningKey> {
	const jwk = JSON.parse(json) as JWK;
	if (!jwk.kid || !jwk.d) throw new Error('SIGNING_KEY must be a private JWK with a kid');
	const publicJwk = publicPart(jwk);
	return {
		kid: jwk.kid,
		privateKey: (await importJWK(jwk, algorithm)) as CryptoKey,
		publicKey: (await importJWK(publicJwk, algorithm)) as CryptoKey,
		publicJwk,
	};
}

/** A new Ed25519 key as private JWK; `pnpm --filter @clinks/api keys` prints one for `.env`. */
export async function generatePrivateJwk(kid = `clinks-${new Date().toISOString().slice(0, 10)}`): Promise<JWK> {
	const { privateKey } = await generateKeyPair(algorithm, { crv: 'Ed25519', extractable: true });
	return { ...(await exportJWK(privateKey)), kid, alg: algorithm };
}

/** A unique key id per start, so services that cache the JWKS (PowerSync) never mix up two keys. */
async function generateSigningKey(): Promise<SigningKey> {
	return importSigningKey(JSON.stringify(await generatePrivateJwk(`clinks-ephemeral-${crypto.randomUUID()}`)));
}
