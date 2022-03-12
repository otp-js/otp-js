import debug from 'debug';
import * as matching from '@otpjs/matching';
import * as otpJSON from '@otpjs/serializer-json';
import util from 'util';

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
                    `expected ${util
                        .inspect(received)
                        .replace(/[\r\n]+/g, ' ')} not to match ${util
                        .inspect(pattern)
                        .replace(/[\r\n]+/g, ' ')}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expected ${util
                        .inspect(received)
                        .replace(/[\r\n]+/g, ' ')} to match ${util
                        .inspect(pattern)
                        .replace(/[\r\n]+/g, ' ')}`,
                pass: false,
            };
        }
    },
    toThrowTerm(received, pattern, thrown) {
        const compiled = matching.compile(pattern);
        const pass = compiled(received?.term);

        if (pass) {
            return {
                message: () =>
                    `expected ${util
                        .inspect(received.term)
                        .replace(/[\r\n]+/g, ' ')} not to match ${util
                        .inspect(pattern)
                        .replace(/[\r\n]+/g, ' ')}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expected ${util
                        .inspect(received.term)
                        .replace(/[\r\n]+/g, ' ')} to match ${util
                        .inspect(pattern)
                        .replace(/[\r\n]+/g, ' ')}`,
                pass: false,
            };
        }
    },
});
