const baseConfig = require('./eslint.config.js');

module.exports = baseConfig.map((config) => {
	if (config.files?.includes('package.json') && config.rules) {
		return {
			...config,
			rules: {
				...config.rules,
				'n8n-nodes-base/community-package-json-name-still-default': 'error',
			},
		};
	}
	return config;
});
