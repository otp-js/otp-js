import { Pid, Ref, list, improperList, tuple } from '@otpjs/types';
import * as matching from '@otpjs/matching';

const { _ } = matching.Symbols;

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

    const useJSON  = 'useJSON' in options ? options.useJSON : true;

    return { serialize, deserialize };

    function deserialize(stringOrObject, reviver = undefined) {
        if (reviver) {
            reviver = kvCompose(
                reviveOTP,
                reviver
            );
        } else {
            reviver = reviveOTP;
        }

        if (useJSON) {
            return JSON.parse(stringOrObject, reviver);
        } else {
            return reviver('', stringOrObject);
        }
    }
    function serialize(data, replacer = undefined) {
        if (replacer) {
            replacer = kvCompose(
                replaceOTP,
                replacer
            );
        } else {
            replacer = replaceOTP;
        }

        if (useJSON) {
            return JSON.stringify(data, replacer);
        } else {
            return replacer('', data);
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
            log(
                'reviveOTP(key: %o, fun: %o)',
                key,
                fun
            );
            return fun;
        } else if (compare(isEncodedPid)) {
            const [node, serial, id, creation] = value.slice(1);
            const nodeId = env.getRouterId(node);
            return Pid.of(nodeId, serial, id, creation);
        } else if (compare(isEncodedRef)) {
            const [node, serial, id, creation] = value.slice(1);
            const nodeId = env.getRouterId(node);
            return new Ref(nodeId, serial, id, creation);
        } else if (compare(isEncodedList)) {
            return improperList(...value[1], value[2]);
        } else if (compare(isEncodedTuple)) {
            return tuple(...value[1]);
        } else if (compare(isEncodedNil)) {
            return list.nil;
        } else {
            return value;
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
            return ['$otp.pid', node, value.id, value.serial, value.creation];
        } else if (compare(Ref.isRef)) {
            const node = env.getRouterName(value.node);
            return ['$otp.ref', node, value.id, value.serial, value.creation];
        } else if (list.isList(value) && value != list.nil) {
            let result = [];
            let node = value;

            while (list.isList(node) && node != list.nil) {
                result.push(node.head);
                node = node.tail;
            }
            let tail = node;

            return ['$otp.list', result, tail];
        } else if (compare(isNil)) {
            return '$otp.list.nil';
        } else if (compare(tuple.isTuple)) {
            return ['$otp.tuple', Array.from(value)];
        } else {
            return value;
        }
    }
    function kvCompose(...funs) {
        return funs.reduceRight(
            (acc, fun) => (key, value) => fun(key, acc(key, value)),
            (_key, value) => value
        );
    }
}
