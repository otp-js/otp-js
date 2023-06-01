import debug from 'debug';
import { OTPError, Pid, Ref, tuple, list, cons } from '@otpjs/types';
import * as Symbols from './symbols';

const { _, spread } = Symbols;

const log = debug('otpjs:matching:core');
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
    };
}
export function compare(pattern, value) {
    const compiled = compile(pattern);
    return compiled(value);
}

export function compile(pattern) {
    if (typeof pattern === 'function') {
        return pattern;
    } else if (pattern instanceof RegExp) {
        return pattern.test.bind(pattern);
    } else {
        if (patterns.has(pattern)) {
            const compiledPattern = patterns.get(pattern);
            return compiledPattern;
        } else if (typeof pattern === 'object') {
            if (pattern === null) {
                return doCompile(pattern);
            } else {
                const compiledPattern = doCompile(pattern);
                patterns.set(pattern, compiledPattern);
                return compiledPattern;
            }
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
            if (!compare(message)) {
                return false;
            }
        }
        return true;
    }
}

function comparator(pattern, comparisons = []) {
    if (tuple.isTuple(pattern)) {
        tupleComparator(pattern, comparisons);
    } else if (list.isList(pattern)) {
        listComparator(pattern, comparisons);
    } else if (Array.isArray(pattern)) {
        arrayComparator(pattern, comparisons);
    } else if (Pid.isPid(pattern)) {
        pidComparator(pattern, comparisons);
    } else if (Ref.isRef(pattern)) {
        refComparator(pattern, comparisons);
    } else if (typeof pattern === 'object') {
        if (pattern === null) {
            nullComparator(pattern, comparisons);
        } else {
            objectComparator(pattern, comparisons);
        }
    } else if (typeof pattern === 'function') {
        comparisons.push(pattern);
    } else if (pattern === _) {
        comparisons.push(underscore);
    } else {
        simpleComparator(pattern, comparisons);
    }

    return comparisons;
}
function pidComparator(pattern, comparisons) {
    comparisons.push(
        (value) => Pid.isPid(value) && Pid.compare(pattern, value) === 0
    );
}
function refComparator(pattern, comparisons) {
    comparisons.push(
        (value) => Ref.isRef(value) && Ref.compare(pattern, value) === 0
    );
}
function simpleComparator(pattern, comparisons) {
    comparisons.push(function simpleCompare(message) {
        log(
            '%s(pattern: %o, message: %o)',
            simpleCompare.name,
            pattern,
            message
        );
        return message === pattern;
    });
}
function arrayComparator(pattern, comparisons, subComparisons = []) {
    const spreadIndex = pattern.indexOf(spread);
    let spreadPattern = _;

    comparisons.push(function isArray(message) {
        return Array.isArray(message);
    });

    if (spreadIndex >= 0) {
        log('%s(pattern: %o)', arrayComparator.name, pattern);
        if (spreadIndex < pattern.length - 2) {
            log(
                '%s(pattern: %o, error: invalid_match_pattern)',
                arrayComparator.name,
                pattern
            );
            throw new OTPError('invalid_match_pattern');
        } else {
            const length = spreadIndex;
            comparisons.push(function containsAtLeast(message) {
                log(
                    '%s(pattern: %o, message.length: %o >= %o)',
                    arrayComparator.name,
                    pattern,
                    message.length,
                    length
                );
                return message.length >= length;
            });
        }
    } else {
        const length = pattern.length;
        comparisons.push(function matchesLength(message) {
            log(
                '%s(pattern: %o, length: %o == %o)',
                arrayComparator.name,
                pattern,
                length,
                message.length
            );
            return message.length === length;
        });
    }

    for (let index = 0; index < pattern.length; index++) {
        const subPattern = pattern[index];
        if (subPattern === spread) {
            if (pattern.length === spreadIndex + 2) {
                spreadPattern = pattern[index + 1];
            }
        } else if (spreadIndex < 0 || index < spreadIndex) {
            const subComparison = compile(subPattern);
            subComparisons.push(subComparison);
        }
    }

    comparisons.push(function compareArrayItems(message) {
        let index;
        let matches = true;

        log('%s(message: %o)', compareArrayItems.name, message);

        for (index = 0; index < subComparisons.length && matches; index++) {
            const compare = subComparisons[index];
            log(
                '%s(index: %o, message[index]: %o)',
                compareArrayItems.name,
                index,
                message[index]
            );
            matches = matches && compare(message[index]);
        }

        log(
            '%s(message: %o, matches: %o)',
            compareArrayItems.name,
            message,
            matches
        );

        return matches;
    });

    if (spreadIndex >= 0) {
        const compareSpread = compile(spreadPattern);
        comparisons.push(function compareArraySpreadItems(message) {
            let matches = true;
            for (
                let index = spreadIndex;
                index < message.length && matches;
                index++
            ) {
                log(
                    '%s(index: %o, message[index]: %o)',
                    compareSpread.name,
                    index,
                    message[index]
                );
                matches = matches && compareSpread(message[index]);
            }
            return matches;
        });
    }
}
function tupleComparator(pattern, comparisons, subComparisons = []) {
    comparisons.push(tuple.isTuple);

    const size = pattern.size;
    comparisons.push(function matchesSize(message) {
        log('%s(%o) : matchesSize(%o)', tupleComparator.name, pattern, size);
        return message.size === size;
    });

    for (let index = 0; index < pattern.size; index++) {
        const subPattern = pattern.get(index);
        const subComparison = compile(subPattern);
        subComparisons.push(subComparison);
    }

    comparisons.push(function compareTupleItems(message) {
        let index;
        let matches = true;

        log('%s(message: %o)', compareTupleItems.name, message);

        for (index = 0; index < subComparisons.length && matches; index++) {
            const compare = subComparisons[index];
            matches = matches && compare(message.get(index));
        }

        log(
            '%s(message: %o, matches: %o)',
            compareTupleItems.name,
            message,
            matches
        );

        return matches;
    });
}
function listComparator(pattern, comparisons, subComparisons = []) {
    comparisons.push(list.isList);

    if (pattern == list.nil) {
        simpleComparator(pattern, comparisons);
        return;
    }

    log('listComparator(list.nil: %o)', list.nil);

    let node = pattern;
    while (list.isList(node) && node != list.nil) {
        const subPattern = node.head;
        const subComparison = compile(subPattern);
        subComparisons.push(subComparison);
        node = node.tail;
    }

    log('listComparator(node: %o)', node);
    const tailPattern = node;
    const tailComparison = compile(tailPattern);

    comparisons.push(function compareListItems(message) {
        let index;
        let matches = true;
        let node = message;

        log('%s(message: %o)', compareListItems.name, node);

        for (
            index = 0;
            index < subComparisons.length &&
            matches &&
            list.isList(node) &&
            node != list.nil;
            index++
        ) {
            const compare = subComparisons[index];
            matches &&= compare(node.head);
            node = node.tail;
        }

        matches &&= index == subComparisons.length;
        matches &&= tailComparison(node);

        return matches;
    });
}
function isNull(message) {
    return message === null;
}
function nullComparator(pattern, comparisons) {
    comparisons.push(isNull);
}
function objectComparator(pattern, comparisons) {
    comparisons.push(function isObject(message) {
        return typeof message === 'object';
    });

    const keys = Object.getOwnPropertyNames(pattern).concat(
        Object.getOwnPropertySymbols(pattern)
    );
    const subPatterns = keys.map((key) => pattern[key]);
    const subComparisons = {};

    if (!keys.includes(spread)) {
        comparisons.push(function matchesSize(message) {
            const messageKeys = Object.getOwnPropertyNames(message).concat(
                Object.getOwnPropertySymbols(message)
            );
            return messageKeys.length === keys.length;
        });
    }

    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const subPattern = subPatterns[index];

        if (subPattern === _) {
            subComparisons[key] = underscore;
        } else {
            subComparisons[key] = compile(subPattern);
        }
    }

    comparisons.push(function compareObjectValues(message) {
        const keys = Object.getOwnPropertyNames(message).concat(
            Object.getOwnPropertySymbols(message)
        );

        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            const compare = subComparisons[key];

            if (compare) {
                if (!compare(message[key])) {
                    return false;
                }
            } else {
                if (!subComparisons[spread]?.(message[key])) {
                    return false;
                }
            }
        }

        return true;
    });
}
function underscore(message) {
    log('%s(message: %o) : always true', underscore.name, message);
    return true;
}
