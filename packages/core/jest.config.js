module.exports = {
    automock: false,
    testRegex: '(/test/.*|(\\.|/)(test|spec))\\.(jsx?)$',
    transform: {
        '\\.jsx?$': ['babel-jest', { rootMode: 'upward' }],
    },
    moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
    testEnvironment: 'node',
    testPathIgnorePatterns: ['lib/'],
    projects: [
        {
            displayName: 'node',
            testEnvironment: 'node',
        },
        { displayName: 'browser', testEnvironment: 'jsdom' },
    ],
};
