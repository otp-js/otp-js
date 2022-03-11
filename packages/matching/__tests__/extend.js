import * as core from '../src';

expect.extend({
    toMatchPattern(received, pattern) {
        const compiled = core.compile(pattern);
        const pass = compiled(received);

        if (pass) {
            return {
                message: () =>
                    `expected ${core.serialize(
                        received
                    )} not to match ${core.serialize(pattern)}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expected ${core.serialize(
                        received
                    )} to match ${core.serialize(pattern)}`,
                pass: false,
            };
        }
    },
});
