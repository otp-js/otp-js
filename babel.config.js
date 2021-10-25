module.exports = function(api) {
    api.cache(true);
    return {
        sourceMaps: false,
        presets: [
            [
                '@babel/preset-env',
                {
                    targets: {
                        browsers: 'last 2 versions',
                        node: 'current',
                        esmodules: false
                    }
                }
            ]
        ]
    };
}
