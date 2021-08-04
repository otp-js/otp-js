module.exports = {
    testRegex: "(/test/.*|(\\.|/)(test|spec))\\.(jsx?)$",
    transform: {
        "\\.jsx?$": "babel-jest"
    },
    moduleNameMapper: {
        "@valkyrie/transports-(.*)": "<rootDir>/transports/$1/src/index.js",
        "@valkyrie/(.*)": "<rootDir>/packages/$1/src/index.js"
    },
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
