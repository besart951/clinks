import { randomBytes } from 'node:crypto';
import { generatePrivateJwk } from './tokens.ts';

// Prints a new signing key. Put it in `.env` as SIGNING_KEY; move the old public key to PREVIOUS_PUBLIC_KEYS.
console.log(`SIGNING_KEY='${JSON.stringify(await generatePrivateJwk())}'`);
// Encrypts tenants' own S3 secrets. Keep it with the backups: without it those secrets must be entered again.
console.log(`STORAGE_SECRET_KEY='${randomBytes(32).toString('base64')}'`);
