export default {
    branches: ['main', { name: 'develop', channel: 'next', prerelease: true }],
    plugins: [
        '@semantic-release/commit-analyzer',
        'semantic-release-lerna',
        '@semantic-release/changelog',
        [
            '@semantic-release/git',
            {
                assets: [
                    'CHANGELOG.md',
                    'lerna.json',
                    'package.json',
                    'package-lock.json',
                    'packages/*/package.json',
                    'transports/*/package.json',
                    'serializers/*/package.json',
                ],
            },
        ],
    ],
};
