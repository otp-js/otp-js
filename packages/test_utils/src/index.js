import debug from 'debug';
import * as matching from '@otpjs/matching';
import util from 'util';

const log = debug('otpjs:test_utils');

Error.stackTraceLimit = Infinity;

expect.extend({
    toHaveBeenNthCalledWithPattern(received, callIndex, ...args) {
        const compiled = matching.compile(args);
        const pass = compiled(received.mock.calls[callIndex]);

        if (pass) {
            return {
                pass: true,
                message: () =>
                    `expected ${util
                        .inspect(received.mock.calls[callIndex])
                        .replace(
                            /[\r\n]+/g,
                            ' '
                        )} not to match the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        } else {
            return {
                pass: false,
                message: () =>
                    `expected ${util
                        .inspect(received.mock.calls[callIndex])
                        .replace(/[\r\n]+/g, ' ')} to match the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        }
    },
    toHaveBeenLastCalledWithPattern(received, ...args) {
        const compiled = matching.compile(args);
        const pass = compiled(received.mock.lastCall);

        if (pass) {
            return {
                pass: true,
                message: () =>
                    `expected ${util
                        .inspect(received.mock.lastCall)
                        .replace(
                            /[\r\n]+/g,
                            ' '
                        )} not to match the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        } else {
            return {
                pass: false,
                message: () =>
                    `expected ${util
                        .inspect(received.mock.lastCall)
                        .replace(/[\r\n]+/g, ' ')} to match the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        }
    },
    toHaveBeenCalledWithPattern(received, ...args) {
        const compiled = matching.compile(args);
        let pass = false;
        let callIndex = 0;
        do {
            pass = compiled(received.mock.calls[callIndex++]);
        } while (!pass && callIndex < received.mock.calls.length);

        if (pass) {
            return {
                pass: true,
                message: () =>
                    `expected function not to have been called with arguments matching the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        } else {
            return {
                pass: false,
                message: () =>
                    `expected function to have been called with arguments matching the pattern ${util
                        .inspect(args)
                        .replace(/[\r\n]+/g, ' ')}`,
            };
        }
    },
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
