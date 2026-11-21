import adapter from '@sveltejs/adapter-static';

const artifact = process.env.WORKSPACE_ARTIFACT === '1';

/** The prototype has no backend, so it uses hash routing and builds to static files. */
export default {
	kit: {
		adapter: adapter({ pages: artifact ? 'build-artifact' : 'build', fallback: 'index.html' }),
		router: { type: 'hash' },
		output: { bundleStrategy: artifact ? 'inline' : 'split' },
	},
};
