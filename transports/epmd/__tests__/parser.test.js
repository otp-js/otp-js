const makeParser = require('../src/parser').default;

describe('@otpjs/transports-epmd/parser', () => {
    it('parses erlang distribution protocol', async function () {
        const parser = makeParser();

        parser.write(
            Buffer.from([
                131, 104, 4, 100, 0, 4, 116, 101, 115, 116, 97, 1, 97, 2, 97, 3,
            ])
        );

        await expect(
            new Promise((resolve) => parser.on('data', resolve))
        ).resolves.toBeInstanceOf(Object);
    });
});
