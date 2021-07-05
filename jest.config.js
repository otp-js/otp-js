const presets = require('ts-jest/presets');
module.exports = {
    testRegex: "(/test/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    collectCoverage: true,
    collectCoverageFrom: [
        "packages/*/src/**/*.{js,ts}"
    ],
    coveragePathIgnorePatterns: [
        "\\.d\\.ts$"
    ],
    rootDir: __dirname,
    testEnvironment: 'node',
    preset: 'ts-jest/presets/js-with-ts',
    transform: {
        "^.+\\.[jt]sx?$": "ts-jest"
    },
    coverageReporters: [
        "json",
        "text",
        "clover",
        ["lcov", { projectRoot: __dirname }]
    ]
};
console.error('module.exports : %O', module.exports);
