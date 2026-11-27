import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { campaignChecks, mayApprove } from '../src/campaigns.ts';

describe('campaigns', () => {
	it('blocks campaigns without subject or recipients and warns about spam words', () => {
		const checks = campaignChecks({ subject: '', previewText: '', body: 'GRATIS!!', audienceTag: '' }, 0);
		assert.ok(checks.some((check) => check.key.endsWith('subject_missing') && check.level === 'error'));
		assert.ok(checks.some((check) => check.key.endsWith('no_recipients') && check.level === 'error'));
		assert.ok(checks.some((check) => check.key.endsWith('spam')));
	});

	it('needs a second person to approve once more than one person writes mail', () => {
		const campaign = { submittedBy: 'lea' };
		assert.equal(mayApprove(campaign, 'lea', 1), true);
		assert.equal(mayApprove(campaign, 'lea', 2), false);
		assert.equal(mayApprove(campaign, 'jonas', 2), true);
	});
});
