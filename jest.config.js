const path = require('path');
function package(index) {
    return path.resolve(__dirname, index);
}
function tool(file) {
    return path.resolve(__dirname, 'tools/', file);
}
module.exports = {
    moduleNameMapper: {
        '@otpjs/transports-(.*)': package('transports/$1/src/index.js'),
        '@otpjs/serializer-(.*)': package('serializers/$1/src/index.js'),
        '@otpjs/(.*)': package('packages/$1/src/index.js'),
    },
    setupFiles: [tool('unhandled.js')],
    setupFilesAfterEnv: [tool('regenerator.js')],
    coverageReporters: [
        'clover',
        'json',
        ['lcov', { projectRoot: path.resolve(__dirname, 'coverage') }],
        'text',
    ],
    projects: [
        'packages/*/jest.config.js',
        'serializers/*/jest.config.js',
        'transports/*/jest.config.js',
    ],
};
