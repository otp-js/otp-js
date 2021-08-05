import debug from 'debug';
import { _, spread } from './symbols';
import { OTPError } from './error';
import { Pid, Ref } from './types';

const log = debug('otpjs:core:matching');

const patterns = new WeakMap();

export function caseOf(value) {
    return (pattern) => compare(pattern, value);
}

export function match(...patterns) {
    let compiled = patterns.map(compile);

    return function matchAny(message) {
        for (let compare of compiled) {
            if (compare(message)) {
                return true;
            }
        }
        return false;
    }
}

export function compare(pattern, value) {
    const compiled = compile(pattern);
    return compiled(value);
}

export function compile(pattern) {
    if (typeof pattern === 'function') {
        return pattern;
    } else {
        if (patterns.has(pattern)) {
            const compiledPattern = patterns.get(pattern);
            return compiledPattern;
        } else if (typeof pattern === 'object') {
            const compiledPattern = doCompile(pattern);
            patterns.set(pattern, compiledPattern);
            return compiledPattern;
        } else {
            return doCompile(pattern);
        }
    }
}

function doCompile(pattern) {
    const comparisons = comparator(pattern);
    return compiledPattern;
    function compiledPattern(message) {
        for (let compare of comparisons) {
            log('%o(%o)', compare, message);
            if (!compare(message)) {
                return false;
            }
        }
        return true;
    }
}

function comparator(pattern, comparisons = []) {
    if (Array.isArray(pattern)) {
        arrayComparator(pattern, comparisons);
    } else if (Pid.isPid(pattern)) {
        pidComparator(pattern, comparisons);
    } else if (Ref.isRef(pattern)) {
        refComparator(pattern, comparisons);
    } else if (typeof pattern === 'object') {
        objectComparator(pattern, comparisons);
    } else if (typeof pattern === 'function') {
        comparisons.push(pattern);
    } else if (pattern === _) {
        comparisons.push(
            underscore
        )
    } else {
        simpleComparator(pattern, comparisons);
    }

    return comparisons;
}

function pidComparator(pattern, comparisons) {
    comparisons.push(
        value => Pid.isPid(value)
            && pattern.node === value.node
            && pattern.process === value.process
    );
}

function refComparator(pattern, comparisons) {
    comparisons.push(
        value => Ref.isRef(value)
            && pattern.node === value.node
            && pattern.ref === value.ref
    );
}

function simpleComparator(pattern, comparisons) {
    comparisons.push(
        function simpleCompare(message) {
            return message === pattern;
        }
    );
}

function arrayComparator(pattern, comparisons, subComparisons = []) {
    comparisons.push(
        function isArray(message) {
            return Array.isArray(message);
        }
    );

    const spreadIndex = pattern.indexOf(spread);
    if (spreadIndex >= 0) {
        if (spreadIndex != pattern.length - 1) {
            throw new OTPError('invalid_match_pattern');
        }
        const length = spreadIndex;
        comparisons.push(
            function containsAtLeast(message) {
                return message.length >= length;
            }
        )
    } else {
        const length = pattern.length;
        comparisons.push(
            function matchesLength(message) {
                return message.length === length;
            }
        );
    }

    for (let index = 0; index < pattern.length; index++) {
        const subPattern = pattern[index];
        if (subPattern === spread) {
            break;
        } else {
            const subComparison = compile(subPattern);
            subComparisons.push(subComparison);
        }
    }

    comparisons.push(
        function compareArrayItems(message) {
            for (let index = 0; index < subComparisons.length; index++) {
                const compare = subComparisons[index]
                if (!compare(message[index])) {
                    return false;
                } else {
                    continue;
                }
            }
            return true;
        }
    )
}

function objectComparator(pattern, comparisons) {
    comparisons.push(function isObject(message) {
        return typeof message === 'object';
    });

    const keys = Object.getOwnPropertyNames(pattern)
        .concat(Object.getOwnPropertySymbols(pattern));
    const subPatterns = keys.map(key => pattern[key]);
    const subComparisons = {};

    if (!keys.includes(spread)) {
        comparisons.push(function matchesSize(message) {
            const messageKeys = Object.getOwnPropertyNames(message)
                .concat(Object.getOwnPropertySymbols(message));
            return messageKeys.length === keys.length;
        })
    }

    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const subPattern = subPatterns[index];

        if (subPattern === _) {
            subComparisons[key] = underscore;
        } else {
            let keyName = key;
            if (typeof key === 'symbol') {
                keyName = key.toString();
            }
            subComparisons[key] = compile(subPattern);
        }
    }

    comparisons.push(function compareObjectValues(message) {
        const keys = Object.getOwnPropertyNames(message)
            .concat(Object.getOwnPropertySymbols(message));

        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            const compare = subComparisons[key];

            if (compare) {
                if (!compare(message[key])) {
                    return false;
                }
            } else {
                if (!subComparisons[spread](message[key])) {
                    return false;
                }
            }
        }

        return true;
    });
}

function underscore(_message) {
    return true;
}
