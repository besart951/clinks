import { generatePrivateJwk } from './tokens.ts';

// Prints a new signing key. Put it in `.env` as SIGNING_KEY; move the old public key to PREVIOUS_PUBLIC_KEYS.
console.log(`SIGNING_KEY='${JSON.stringify(await generatePrivateJwk())}'`);
