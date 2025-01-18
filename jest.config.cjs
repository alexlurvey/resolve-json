module.exports = {
	extensionsToTreatAsEsm: ['.ts'],
	testMatch: [
		'**/__tests__/(?!(mocks))/**/*.[jt]s?(x)',
		'**/?(*.)+(spec|test).[jt]s?(x)',
	],
};
