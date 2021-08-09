module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: 'both',
        sourceRoot: __dirname,
        presets: [
            [
                '@babel/preset-env',
                {
                    targets: {
                        node: 'current',
                        browsers: '> 1%, not dead'
                    },
                    useBuiltIns: 'entry',
                    corejs: "3.16"
                }
            ],
            '@babel/preset-react'
        ],
        plugins: [
            'babel-plugin-source-map-support'
        ]
    };
}
