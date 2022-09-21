module.exports = function (api) {
    api.cache(true);
    return {
        sourceMaps: false,
        presets: [
            [
                '@babel/env',
                {
                    useBuiltIns: 'entry',
                    corejs: { version: '3.19' },
                    targets: {
                        browsers: 'last 2 Chrome versions',
                        node: 'current',
                        esmodules: false,
                    },
                },
            ],
        ],
        plugins: ['@babel/plugin-transform-runtime'],
    };
};
