module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: 'inline',
        'presets': [
            [
                '@babel/preset-env',
                {
                    targets: {
                        node: 'current',
                        browsers: '> 0.25%, not dead'
                    }
                }
            ]
        ],
    };
}
