import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packagePath(index) {
    return path.resolve(__dirname, index);
}

function tool(file) {
    return path.resolve(__dirname, 'tools/', file);
}

const lcovConfig = process.env.CI
    ? {}
    : { projectRoot: path.resolve(__dirname, 'coverage') };

export default {
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '@otpjs/transports-(.*)': packagePath('transports/$1/src/index.js'),
        '@otpjs/serializer-(.*)': packagePath('serializers/$1/src/index.js'),
        '@otpjs/(.*)': packagePath('packages/$1/src/index.js'),
    },
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    injectGlobals: true,
    setupFiles: [tool('jest_global.js'), tool('unhandled.js')],
    setupFilesAfterEnv: [tool('test_utils.js')],
    collectCoverageFrom: ['<rootDir>/src/**/*.js'],
    coveragePathIgnorePatterns: ['<rootDir>/lib'],
    coverageReporters: ['clover', 'json', ['lcov', lcovConfig], 'text'],
    transform: {},
    projects: [
        'packages/core/jest.config.js',
        'packages/gen/jest.config.js',
        'packages/gen_server/jest.config.js',
        'packages/matching/jest.config.js',
        'packages/node/jest.config.js',
        'packages/proc_lib/jest.config.js',
        'packages/supervisor/jest.config.js',
        'packages/test_utils/jest.config.js',
        'packages/types/jest.config.js',
        'serializers/json/jest.config.js',
        'transports/socket.io/jest.config.js',
    ],
};
