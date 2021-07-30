import debug from 'debug';
import * as OTP from '@otpjs/core';

const log = debug('otpjs:test_utils');

Error.stackTraceLimit = Infinity;

expect.extend({
    toMatchPattern(received, pattern) {
        log('toMatchPattern(%o, %o)', received, pattern);
        const compiled = OTP.compile(pattern);
        const pass = compiled(received);

        if (pass) {
            return {
                message: () =>
                    `expected ${OTP.serialize(received)} not to match ${OTP.serialize(pattern)}`,
                pass: true
            };
        } else {
            return {
                message: () =>
                    `expected ${OTP.serialize(received)} to match ${OTP.serialize(pattern)}`,
                pass: false
            };
        }
    }
});
