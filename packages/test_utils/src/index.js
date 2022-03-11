import debug from 'debug';
import * as matching from '@otpjs/matching';
import * as otpJSON from '@otpjs/serializer-json';

const log = debug('otpjs:test_utils');

Error.stackTraceLimit = Infinity;

expect.extend({
    toMatchPattern(received, pattern) {
        log('toMatchPattern(%o, %o)', received, pattern);
        const compiled = matching.compile(pattern);
        const pass = compiled(received);

        if (pass) {
            return {
                message: () =>
                    `expected ${otpJSON.serialize(
                        received
                    )} not to match ${otpJSON.serialize(pattern)}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expected ${otpJSON.serialize(
                        received
                    )} to match ${otpJSON.serialize(pattern)}`,
                pass: false,
            };
        }
    },
});
