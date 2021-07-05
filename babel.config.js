module.exports = function(api) {
    api.cache(true);
    return {
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
