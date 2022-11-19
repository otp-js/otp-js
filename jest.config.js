module.exports = {
    automock: false,
    testRegex: '(/test/.*|(\\.|/)(test|spec))\\.(jsx?)$',
    transform: {
        '\\.jsx?$': 'babel-jest',
    },
    moduleNameMapper: {
        '@otpjs/transports-(.*)': '<rootDir>/transports/$1/src/index.js',
        '@otpjs/serializer-(.*)': '<rootDir>/serializers/$1/src/index.js',
        '@otpjs/(.*)': '<rootDir>/packages/$1/src/index.js',
    },
    setupFiles: ['./tools/unhandled.js'],
    setupFilesAfterEnv: ['./tools/regenerator.js'],
    moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
    collectCoverage: true,
    collectCoverageFrom: [
        'packages/*/src/**/*.js',
        'serializers/*/src/**/*.js',
        'transports/*/src/**/*.js',
    ],
    rootDir: __dirname,
    testEnvironment: 'node',
    testPathIgnorePatterns: ['dnp/'],
    coveragePathIgnorePatterns: ['dnp/'],
    coverageReporters: [
        'json',
        'text',
        'clover',
        ['lcov', { projectRoot: __dirname }],
    ],
};
