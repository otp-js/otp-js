const path = require('path');
function package(index) {
    return path.resolve(__dirname, index);
}
function tool(file) {
    return path.resolve(__dirname, 'tools/', file);
}

const lcovConfig = process.env.CI
    ? {}
    : { projectRoot: path.resolve(__dirname, 'coverage') };

module.exports = {
    moduleNameMapper: {
        '@otpjs/transports-(.*)': package('transports/$1/src/index.js'),
        '@otpjs/serializer-(.*)': package('serializers/$1/src/index.js'),
        '@otpjs/(.*)': package('packages/$1/src/index.js'),
    },
    setupFiles: [tool('unhandled.js')],
    setupFilesAfterEnv: [tool('regenerator.js')],
    collectCoverageFrom: ['<rootDir>/src/**/*.js'],
    coveragePathIgnorePatterns: ['<rootDir>/lib'],
    coverageReporters: ['clover', 'json', ['lcov', lcovConfig], 'text'],
    projects: [
        'packages/core/jest.config.js',
        'packages/gen/jest.config.js',
        'packages/gen_server/jest.config.js',
        'packages/matching/jest.config.js',
        'packages/proc_lib/jest.config.js',
        'packages/supervisor/jest.config.js',
        'packages/test_utils/jest.config.js',
        'packages/types/jest.config.js',
        'serializers/json/jest.config.js',
        'transports/socket.io/jest.config.js',
    ],
};
