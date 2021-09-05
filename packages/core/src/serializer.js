import { Pid, Ref } from "./types";
import { caseOf } from './matching';
import { _ } from './symbols';

export function deserialize(string, reviver = undefined) {
    if (reviver) {
        reviver = kvCompose(reviver, reviveOTP);
    } else {
        reviver = reviveOTP;
    }
    return JSON.parse(string, reviver);
}

export function serialize(data, replacer = undefined) {
    if (replacer) {
        replacer = kvCompose(replaceOTP, replacer);
    } else {
        replacer = replaceOTP;
    }
    return JSON.stringify(data, replacer);
}

function kvCompose(...funs) {
    return funs.reduceRight(
        (acc, fun) => (key, value) => fun(key, acc(key, value)),
        (_key, value) => value
    )
}

function reviveOTP(key, value) {
    const compare = caseOf(value);
    if (compare(['$otp.symbol', _])) {
        return Symbol.for(value[1]);
    } else if (compare(['$otp.pid', _])) {
        return new Pid(value[1]);
    } else if (compare(['$otp.ref', _])) {
        return new Ref(value[1])
    } else {
        return value;
    }
}

const isSymbol = (v) => typeof v === 'symbol';
function replaceOTP(key, value) {
    const compare = caseOf(value);
    if (compare(isSymbol)) {
        const key = Symbol.keyFor(value);
        if (key) {
            return ['$otp.symbol', key];
        } else {
            return undefined;
        }
    } else if (compare(Pid.isPid)) {
        return ['$otp.pid', value.toString()];
    } else if (compare(Ref.isRef)) {
        return ['$otp.ref', value.toString()];
    } else {
        return value;
    }
}
