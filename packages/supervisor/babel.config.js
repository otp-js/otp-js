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
                    }
                }
            ]
        ],
        plugins: [
            'babel-plugin-source-map-support'
        ]
    };
}
