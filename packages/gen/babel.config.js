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
                        node: 'current'
                    },
                    useBuiltIns: "usage",
                    "corejs": "3.16"
                }
            ]
        ],
        plugins: [
            'babel-plugin-source-map-support'
        ]
    };
}
