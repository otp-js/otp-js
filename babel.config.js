module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: false,
        presets: [
            [
                '@babel/preset-env',
                {
                    targets: {
                        node: 'current',
                        esmodules: false
                    }
                }
            ]
        ]
    };
}
