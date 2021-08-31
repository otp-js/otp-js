module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: 'both',
        presets: [
            [
                '@babel/preset-env',
                {
                    targets: "> 0.25%, not dead",
                    useBuiltIns: 'usage',
                    corejs: "3.16.4"
                }
            ]
        ],
        plugins: [
            'babel-plugin-source-map-support'
        ]
    };
}
