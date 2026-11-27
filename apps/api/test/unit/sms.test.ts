import assert from 'node:assert/strict';
import { it } from 'vitest';
import { noSms } from '../../src/sms.ts';

it('has no SMS provider yet: sending fails instead of pretending', async () => {
	assert.equal(noSms.name, 'none');
	await assert.rejects(noSms.send('+41791234567', 'Termin morgen'), /No SMS provider/);
});
