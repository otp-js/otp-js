const path = require('path');
module.exports = {
    entry: path.resolve(__dirname, 'client/src/index.js'),
    mode: 'development',
    resolve: {
        fallback: {
            path: false,
            fs: false
        }
    },
    output: {
        path: path.resolve(__dirname, 'client/lib'),
        filename: 'client.bundle.js'
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            exclude: [
                                /node_modules/,
                                /lib/
                            ]
                        }
                    }
                ]
            }
        ]
    }
}
