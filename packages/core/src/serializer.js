import { Pid, Ref } from "./types";

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
        replacer = kvCopose(replacer, replaceOTP);
    } else {
        replacer = replaceOTP;
    }
    return JSON.stringify(data, replacer);
}

function kvCompose(...funs) {
    return funs.reduceRight(
        (acc, fun) => (key, value) => acc(key, fun(key, value)),
        (_key, value) => value
    )
}

function reviveOTP(key, value) {
    if (typeof value === 'object') {
        if (value['$otp.symbol']) {
            return Symbol.for(value['$otp.symbol']);
        } else if (value['$otp.pid']) {
            return new Pid(value['$otp.pid']);
        } else if (value['$otp.ref']) {
            return new Ref(value['$otp.ref'])
        } else {
            return value;
        }
    } else {
        return value;
    }
}

function replaceOTP(key, value) {
    if (typeof value === 'symbol') {
        const key = Symbol.keyFor(value);
        if (key) {
            return { '$otp.symbol': key };
        } else {
            return undefined;
        }
    } else if (value instanceof Pid) {
        return { '$otp.pid': value.toString() };
    } else if (value instanceof Ref) {
        return { '$otp.ref': value.toString() };
    } else {
        return value;
    }
}