import {
    EXPECTED_COLOR,
    matcherErrorMessage,
    matcherHint,
    printReceived,
    printExpected,
    printWithType,
    RECEIVED_COLOR,
} from 'jest-matcher-utils';
import { formatStackTrace, separateMessageFromStack } from 'jest-message-util';
import * as matching from '@otpjs/matching';
import debug from 'debug';
import util from 'util';

const log = debug('otpjs:test_utils');
const specialLog = debug('otpjs:test_utils:special');

const DID_NOT_THROW = 'Received function did not throw';

function isOTPError(err) {
    return err instanceof Error && err.term !== undefined;
}

Error.stackTraceLimit = Infinity;

function getOTPThrown(err) {
    const hasTerm =
        err !== null && err !== undefined && typeof err.term !== 'undefined';

    if (
        hasTerm &&
        typeof err.name === 'string' &&
        typeof err.stack === 'string'
    ) {
        return { hasTerm, isError: true, term: err.term, value: err };
    } else {
        return {
            hasTerm,
            isError: false,
            term: hasTerm ? err.term : null,
            value: err,
        };
    }
}

function createOTPMatcher(matcherName) {
    return async function (received, expected) {
        const fromPromise = !!this.promise;
        const options = {
            isNot: this.isNot,
            promise: this.promise,
        };

        let thrown = null;

        if (fromPromise && isOTPError(received)) {
            thrown = getOTPThrown(received);
        } else {
            if (typeof received !== 'function') {
                if (!fromPromise) {
                    const placeholder =
                        expected === undefined ? '' : 'expected';
                    throw new Error(
                        matcherErrorMessage(
                            matcherHint(
                                matcherName,
                                undefined,
                                placeholder,
                                options
                            ),
                            `${RECEIVED_COLOR(
                                'received'
                            )} value must be a function`
                        ),
                        printWithType('Received', received, printReceived)
                    );
                }
            } else {
                try {
                    received();
                } catch (err) {
                    thrown = getOTPThrown(err);
                }
            }
        }

        specialLog('toThrowTerm(thrown: %o)', thrown);

        if (expected) {
            const compiled = matching.compile(expected);
            const hasThrown = !!thrown;
            const hasTerm = thrown?.hasTerm ?? false;
            const matchesPattern = thrown ? compiled(thrown.term) : false;
            const pass = hasThrown && hasTerm && matchesPattern;

            specialLog(
                'toThrowTerm(received: %o, expected: %o, pass: %o)',
                received,
                expected,
                pass
            );

            if (pass) {
                specialLog('toThrowTerm(pass)');
                if (this.isNot) {
                    const result = {
                        message: () =>
                            matcherHint(
                                matcherName,
                                undefined,
                                undefined,
                                options
                            ) +
                            '\n\n' +
                            formatExpected('Expected pattern: not ', expected) +
                            '\n' +
                            (thrown !== null && thrown.hasTerm
                                ? formatReceived(
                                      'Received message: ',
                                      thrown,
                                      'term',
                                      expected
                                  ) + formatStack(thrown)
                                : formatReceived(
                                      'Received value: ',
                                      thrown,
                                      'value'
                                  )),
                        pass: false,
                    };

                    specialLog('toThrowTerm(result: %o)', result);

                    return result;
                } else {
                    const result = {
                        message: () =>
                            matcherHint(
                                matcherName,
                                undefined,
                                undefined,
                                options
                            ) +
                            '\n\n' +
                            formatExpected('Expected pattern: ', expected) +
                            '\n' +
                            (thrown !== null && thrown.hasTerm
                                ? formatReceived(
                                      'Received message: ',
                                      thrown,
                                      'term',
                                      expected
                                  ) + formatStack(thrown)
                                : formatReceived(
                                      'Received value: ',
                                      thrown,
                                      'value'
                                  )),
                        pass: true,
                    };

                    specialLog('toThrowTerm(result: %o)', result);

                    return result;
                }
            } else {
                specialLog('toThrowTerm(nopass)');
                if (!thrown) {
                    specialLog('toThrowTerm(nothrown)');
                    return {
                        message: () =>
                            matcherHint(
                                matcherName,
                                undefined,
                                undefined,
                                options
                            ) +
                            '\n\n' +
                            formatExpected('Expected pattern: ', expected) +
                            '\n' +
                            DID_NOT_THROW,
                        pass: false,
                    };
                } else {
                    specialLog('toThrowTerm(thrown)');
                    if (thrown.hasTerm) {
                        specialLog('toThrowTerm(hasTerm)');
                        return {
                            message: () =>
                                matcherHint(
                                    matcherName,
                                    undefined,
                                    undefined,
                                    options
                                ) +
                                '\n\n' +
                                formatExpected('Expected pattern: ', expected) +
                                '\n' +
                                formatReceived(
                                    'Received message: ',
                                    thrown,
                                    'term',
                                    expected
                                ) +
                                formatStack(thrown),
                            pass: false,
                        };
                    } else {
                        specialLog('toThrowTerm(hasNoTerm)');
                        return {
                            message: () =>
                                matcherHint(
                                    matcherName,
                                    undefined,
                                    undefined,
                                    options
                                ) +
                                '\n\n' +
                                formatExpected('Expected pattern: ', expected) +
                                '\n' +
                                formatReceived(
                                    'Received value: ',
                                    thrown,
                                    'value'
                                ),
                            pass: false,
                        };
                    }
                }
            }
        }
    };
}

function formatExpected(label, expected) {
    return `${label + printExpected(util.inspect(expected))}`;
}

function formatReceived(label, thrown, key, expected) {
    specialLog('formatReceived(label: %o, thrown: %o)', label, thrown);
    if (thrown === null) {
        return '';
    } else {
        const result = thrown
            ? `${
                  label +
                  printReceived(
                      thrown.term ? util.inspect(thrown.term) : thrown.message
                  )
              }`
            : '';
        specialLog('formatReceived(label: %o, thrown: %o)', label, thrown);
        return result;
    }
}

function formatStack(thrown) {
    if (thrown === null || !thrown.isError) {
        return '';
    } else {
        return formatStackTrace(
            separateMessageFromStack(thrown.value.stack).stack,
            { rootDir: process.cwd(), testMatch: [] },
            { noStackTrace: false }
        );
    }
}

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
    toThrowTerm: createOTPMatcher('toThrowTerm'),
});
