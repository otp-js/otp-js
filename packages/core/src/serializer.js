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
    } else if (compare(['$otp.function', _, _])) {
        return new (Function.bind.apply(
            Function,
            [Function].concat(
                value[1],
                [value[2]]
            )
        ));
    } else if (compare(['$otp.pid', _])) {
        return new Pid(value[1]);
    } else if (compare(['$otp.ref', _])) {
        return new Ref(value[1])
    } else {
        return value;
    }
}

const isSymbol = (v) => typeof v === 'symbol';
const isFunction = (v) => typeof v === 'function';
function replaceOTP(key, value) {
    const compare = caseOf(value);
    if (compare(isSymbol)) {
        const key = Symbol.keyFor(value);
        if (key) {
            return ['$otp.symbol', key];
        } else {
            return undefined;
        }
    } else if (compare(isFunction)) {
        return serializeFunction(value);
    } else if (compare(Pid.isPid)) {
        return ['$otp.pid', value.toString()];
    } else if (compare(Ref.isRef)) {
        return ['$otp.ref', value.toString()];
    } else {
        return value;
    }
}

function serializeFunction(fun) {
    let whitespace = /\s/;
    let pair = /\(\)|\[\]|\{\}/;

    let args = new Array();
    let string = this.toString();

    let fat = (new RegExp(
        '^\s*(' +
        ((this.name) ? this.name + '|' : '') +
        'function' +
        ')[^)]*\\('
    )).test(fun);

    let state = 'start';
    let depth = new Array();
    let tmp;

    for (let index = 0; index < fun.length; ++index) {
        let ch = fun[index];

        switch (state) {
            case 'start':
                if (whitespace.test(ch) || (fat && ch != '('))
                    continue;

                if (ch == '(') {
                    state = 'arg';
                    tmp = index + 1;
                }
                else {
                    state = 'singleArg';
                    tmp = index;
                }
                break;

            case 'arg':
            case 'singleArg':
                let escaped = depth.length > 0 && depth[depth.length - 1] == '\\';
                if (escaped) {
                    depth.pop();
                    continue;
                }
                if (whitespace.test(ch))
                    continue;

                switch (ch) {
                    case '\\':
                        depth.push(ch);
                        break;

                    case ']':
                    case '}':
                    case ')':
                        if (depth.length > 0) {
                            if (pair.test(depth[depth.length - 1] + ch))
                                depth.pop();
                            continue;
                        }
                        if (state == 'singleArg')
                            throw '';
                        args.push(fun.substring(tmp, index).trim());
                        state = (fat) ? 'body' : 'arrow';
                        break;

                    case ',':
                        if (depth.length > 0)
                            continue;
                        if (state == 'singleArg')
                            throw '';
                        args.push(fun.substring(tmp, index).trim());
                        tmp = index + 1;
                        break;

                    case '>':
                        if (depth.length > 0)
                            continue;
                        if (fun[index - 1] != '=')
                            continue;
                        if (state == 'arg')
                            throw '';
                        args.push(fun.substring(tmp, index - 1).trim());
                        state = 'body';
                        break;

                    case '{':
                    case '[':
                    case '(':
                        if (
                            depth.length < 1 ||
                            !(depth[depth.length - 1] == '"' || depth[depth.length - 1] == '\'')
                        )
                            depth.push(ch);
                        break;

                    case '"':
                        if (depth.length < 1)
                            depth.push(ch);
                        else if (depth[depth.length - 1] == '"')
                            depth.pop();
                        break;
                    case '\'':
                        if (depth.length < 1)
                            depth.push(ch);
                        else if (depth[depth.length - 1] == '\'')
                            depth.pop();
                        break;
                }
                break;

            case 'arrow':
                if (whitespace.test(ch))
                    continue;
                if (ch != '=')
                    throw '';
                if (fun[++index] != '>')
                    throw '';
                state = 'body';
                break;

            case 'body':
                if (whitespace.test(ch))
                    continue;
                fun = fun.substring(index);

                if (ch == '{')
                    fun = fun.replace(/^{\s*(.*)\s*}\s*$/, '$1');
                else
                    fun = 'return ' + fun.trim();

                index = fun.length;
                break;

            default:
                throw '';
        }
    }

    return ['$otp.function', args, fun];
}
