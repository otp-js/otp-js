module.exports = {
    automock: false,
    testRegex: '(/test/.*|(\\.|/)(test|spec))\\.(jsx?)$',
    transform: {
        '\\.jsx?$': ['babel-jest', { rootMode: 'upward' }],
    },
    moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
    collectCoverage: true,
    collectCoverageFrom: ['<rootDir>/src/**/*.js'],
    testEnvironment: 'node',
    testPathIgnorePatterns: ['lib/'],
    coveragePathIgnorePatterns: ['lib/', '__tests__/'],
    coverageReporters: [
        'json',
        'text',
        'clover',
        ['lcov', { projectRoot: __dirname }],
    ],
};
