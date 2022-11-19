import { Pid, Ref, list, improperList, tuple } from '@otpjs/types';
import * as matching from '@otpjs/matching';

const { _ } = matching.Symbols;

function isEmpty(v) {
    for (let _k in v) return false;
    return true;
}

function isNull(v) {
    return v === null;
}

export function make(env, options = {}) {
    const log = env.logger('serializer:json');
    const isSymbol = (v) => typeof v === 'symbol';
    const isNil = (v) => v === list.nil;
    const isFunction = (v) => typeof v === 'function';
    const isEncodedSymbol = matching.compile(['$otp.symbol', _]);
    const isEncodedFunction = matching.compile(['$otp.function', _, _]);
    const isEncodedPid = matching.compile(['$otp.pid', _, _, _, _]);
    const isEncodedRef = matching.compile(['$otp.ref', _, _, _, _]);
    const isEncodedList = matching.compile(['$otp.list', _, _]);
    const isEncodedTuple = matching.compile(['$otp.tuple', _]);
    const isEncodedNil = matching.compile('$otp.list.nil');

    const stringify = 'stringify' in options ? options.stringify : true;

    return { serialize, deserialize };

    function walk(obj, key = '') {
        return {
            with(fn) {
                const stack = [];

                let original = obj;
                let current = obj;
                let acc = initialFor(current);
                let currentKey = key;

                log('walk(in: %o)', obj);
                while (stack.length > 0 || current !== undefined) {
                    process();
                }
                log('walk(out: %o)', acc);

                return acc;

                function process() {
                    if (Array.isArray(current)) {
                        if (current.length > 0) {
                            const [next, ...rest] = current;
                            defer(currentKey, rest, original, acc);
                            push(acc.length, next);
                        } else {
                            accept(currentKey, original, acc);
                        }
                    } else if (typeof current === 'object') {
                        if (isNull(current)) {
                            accept(currentKey, original, original);
                        } else if (isEmpty(current)) {
                            accept(currentKey, original, acc);
                        } else {
                            const [nextKey] = Object.getOwnPropertyNames(current);
                            const { [nextKey]: next, ...rest } = current;

                            defer(currentKey, rest, original, acc);
                            push(nextKey, next);
                        }
                    } else {
                        accept(currentKey, original, original);
                    }
                }

                function initialFor(obj) {
                    switch (typeof obj) {
                        case 'object':
                            if (Array.isArray(obj)) {
                                return [];
                            } else if (isNull(obj)) {
                                return null;
                            } else {
                                return {};
                            }
                        case 'string':
                            return '';
                        case 'number':
                            return 0;
                        case 'symbol':
                            return '';
                        case 'bigint':
                            return 0n;
                        case 'undefined':
                        default:
                            return undefined;
                    }
                }
                function push(key, obj) {
                    original = obj;
                    current = obj;
                    currentKey = key;
                    acc = initialFor(obj);
                }
                function defer(key, obj, original, acc) {
                    stack.push({ key, obj, original, acc });
                }
                function accept(key, original, accumulated) {
                    const processed = fn(key, original);
                    if (processed) {
                        log('accept(key: %o, %o -> %o)', key, original, processed)
                        moveNext(processed);
                    } else {
                        log('accept(key: %o, %o -> %o)', key, original, accumulated ?? original)
                        moveNext(accumulated ?? original);
                    }
                }
                function moveNext(accepted) {
                    const next = stack.pop();
                    if (next) {
                        assign(next.acc, currentKey, accepted);

                        original = next.original;
                        current = next.obj;
                        acc = next.acc;
                        currentKey = next.key;
                    } else {
                        acc = accepted;
                        current = undefined;
                    }
                }
                function assign(acc, key, value) {
                    if (Array.isArray(acc)) {
                        acc.splice(key + 1, 0, value);
                    } else if (typeof acc === 'object') {
                        acc[key] = value;
                    } else {
                        return value;
                    }
                }
            },
        };
    }

    function deserialize(stringOrObject, reviver = undefined) {
        if (reviver) {
            reviver = kvCompose(reviveOTP, reviver);
        } else {
            reviver = reviveOTP;
        }

        if (stringify) {
            return JSON.parse(stringOrObject, reviver);
        } else {
            return walk(stringOrObject).with(reviver);
        }
    }
    function serialize(data, replacer = undefined) {
        if (replacer) {
            replacer = kvCompose(replaceOTP, replacer);
        } else {
            replacer = replaceOTP;
        }

        if (stringify) {
            return JSON.stringify(data, replacer);
        } else {
            return walk(data).with(replacer);
        }
    }
    function reviveOTP(key, value) {
        const compare = matching.caseOf(value);
        if (compare(isEncodedSymbol)) {
            return Symbol.for(value[1]);
        } else if (compare(isEncodedFunction)) {
            const fun = new (Function.bind.apply(
                Function,
                [Function].concat(value[1], [value[2]])
            ))();
            return fun;
        } else if (compare(isEncodedPid)) {
            const [node, serial, id, creation] = value.slice(1);
            const nodeName = reviveOTP('', node) ?? node;
            const nodeId = env.getRouterId(nodeName);
            return Pid.of(nodeId, serial, id, creation);
        } else if (compare(isEncodedRef)) {
            const [node, serial, id, creation] = value.slice(1);
            const nodeName = reviveOTP('', node) ?? node;
            const nodeId = env.getRouterId(nodeName);
            return new Ref(nodeId, serial, id, creation);
        } else if (compare(isEncodedList)) {
            return improperList(
                ...value[1].map((value, index) => reviveOTP(index, value) ?? value),
                reviveOTP('', value[2]) ?? value[2]
            );
        } else if (compare(isEncodedTuple)) {
            return tuple(
                ...value[1].map((value, index) => reviveOTP(index, value) ?? value)
            );
        } else if (compare(isEncodedNil)) {
            return list.nil;
        } else {
            if (stringify) {
                return value;
            } else {
                return undefined;
            }
        }
    }
    function replaceOTP(key, value) {
        const compare = matching.caseOf(value);
        if (compare(isSymbol)) {
            const key = Symbol.keyFor(value);
            if (key) {
                return ['$otp.symbol', key];
            } else {
                return undefined;
            }
        } else if (compare(isFunction)) {
            const parts = value
                .toString()
                .match(
                    /^\s*(?:function)?[^\(]*\(?([^]*?)\)\s*(?:=>)?\s*{?([^]*?)}?\s*$/
                );

            if (parts == null)
                throw `Function form not supported: ${value.toString()}`;

            return [
                '$otp.function',
                parts[1].trim().split(/\s*,\s*/),
                parts[2].replace(/\s+/, ' '),
            ];
        } else if (compare(Pid.isPid)) {
            const node = env.getRouterName(value.node);
            return [
                '$otp.pid',
                replaceOTP('', node),
                value.id,
                value.serial,
                value.creation,
            ];
        } else if (compare(Ref.isRef)) {
            const node = env.getRouterName(value.node);
            return [
                '$otp.ref',
                replaceOTP('', node),
                value.id,
                value.serial,
                value.creation,
            ];
        } else if (list.isList(value) && value != list.nil) {
            let result = [];
            let node = value;
            let index = 0;

            while (list.isList(node) && node != list.nil) {
                const transformed = replaceOTP(index, node.head) ?? node.head;
                result.push(transformed);
                node = node.tail;
            }
            let tail = node;

            return ['$otp.list', result, replaceOTP('', tail) ?? tail];
        } else if (compare(isNil)) {
            return '$otp.list.nil';
        } else if (compare(tuple.isTuple)) {
            return [
                '$otp.tuple',
                Array.from(value).map((value, index) =>
                    replaceOTP(index, value) ?? value
                ),
            ];
        } else {
            if (stringify) {
                return value;
            } else {
                return undefined;
            }
        }
    }
    function kvCompose(...funs) {
        return funs.reduceRight(
            (acc, fun) => (key, value) => fun(key, acc(key, value) ?? value),
            (_key, value) => value
        );
    }
}
