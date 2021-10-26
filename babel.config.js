module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: false,
        presets: [
            [
                '@babel/env',
                {
                    useBuiltIns: 'entry',
                    corejs: { version: '3.19', proposals: true },
                    targets: {
                        browsers: ['>0.25%, not dead, not ie < 12'],
                        node: 'current',
                        esmodules: false
                    }
                }
            ]
        ],
        plugins: [
            '@babel/transform-runtime'
        ]
    };
}
