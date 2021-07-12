import debug from 'debug';
import { _, spread } from './symbols';

const log = debug('otpjs:core:matching');

export function compile(pattern, name = 'compiledPattern') {
    const comparisons = comparator(pattern);
    const fun = function compiledPattern(message) {
        for (let compare of comparisons) {
            if (!compare(message)) {
                return false;
            }
        }
        return true;
    }

    if (name != fun.name) {
        Object.defineProperty(
            fun,
            'name',
            {
                value: name,
                configurable: true
            }
        );
    }

    return fun;
}

function comparator(pattern, comparisons = []) {
    if (Array.isArray(pattern)) {
        arrayComparator(pattern, comparisons);
    } else if (typeof pattern === 'object') {
        objectComparator(pattern, comparisons);
    } else if (typeof pattern === 'function') {
        comparisons.push(pattern);
    } else if (pattern === _) {
        // No comparison needed
    } else {
        simpleComparator(pattern, comparisons);
    }

    return comparisons;
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
            throw Error('invalid_match_pattern');
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
            const subComparison = compile(subPattern, `compareArrayItem-${index}`);
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
            subComparisons[key] = function underscore(_message) {
                return true;
            }
        } else {
            let keyName = key;
            if (typeof key === 'symbol') {
                keyName = key.toString();
            }
            subComparisons[key] = compile(subPattern, `compareObjectKey-${keyName}`);
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
