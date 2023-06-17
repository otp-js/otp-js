module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true
    },
    extends: ['eslint:recommended', 'semistandard'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        indent: [
            'error',
            4,
            { SwitchCase: 1, MemberExpression: 1 }
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        quotes: [
            'error',
            'single'
        ],
        semi: [
            'error',
            'always'
        ],
        'max-len': [
            'error',
            {
                code: 120,
                ignoreTrailingComments: true,
                ignoreTemplateLiterals: true,
                ignoreStrings: true
            }
        ],
        'space-before-function-paren': ['off'],
        camelcase: [
            'off'
        ],
        'no-unused-vars': [
            'error',
            {
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                destructuredArrayIgnorePattern: '^_'
            }
        ]
    }
};
