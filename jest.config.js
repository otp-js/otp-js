module.exports = {
    testRegex: "(/test/.*|(\\.|/)(test|spec))\\.(jsx?)$",
    setupFilesAfterEnv: ['./tools/regenerator.js'],
    moduleFileExtensions: ["js", "jsx", "json", "node"],
    collectCoverage: true,
    collectCoverageFrom: [
        "packages/*/src/**/*.js",
        "transports/*/src/**/*.js"
    ],
    rootDir: __dirname,
    testEnvironment: 'node',
    coverageReporters: [
        "json",
        "text",
        "clover",
        ["lcov", { projectRoot: __dirname }]
    ]
};
