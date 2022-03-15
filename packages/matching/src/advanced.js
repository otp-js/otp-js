import debug from 'debug';
import { OTPError, Pid, Ref, tuple, list, cons } from '@otpjs/types';
import * as Symbols from './symbols';
import { Node } from '@otpjs/core';
import { compile } from './core';

const { _, spread, case_clause, route_clause } = Symbols;

const log = debug('otpjs:matching:advanced');

export function buildCase(builder) {
    let handlers = list.nil;

    builder((pattern, handler) => {
        const compiled = compile(pattern);
        handlers = cons(tuple(compiled, handler), handlers);
    });
    handlers = handlers.reverse();

    return {
        for(value) {
            for (let [pattern, handler] of handlers) {
                if (pattern(value)) {
                    return handler;
                }
            }
            throw OTPError(case_clause);
        },
        with(value) {
            for (let [pattern, handler] of handlers) {
                if (pattern(value)) {
                    return handler(value);
                }
            }
            throw OTPError(case_clause);
        },
    };
}
export function clauses(builder) {
    let handlers = list.nil;
    const route = (...pattern) => {
        const test = compile(pattern);
        return {
            to(handler) {
                handlers = cons(tuple(pattern, test, handler), handlers);
            },
        };
    };

    builder(route);
    handlers = handlers.reverse();

    return function (...args) {
        let subject = args;
        if (args[0] instanceof Node.Context) {
            subject = args.slice(1);
        }
        for (let [pattern, test, handler] of handlers) {
            const result = test(subject);
            log(
                'clauses(pattern: %o, subject: %o, result: %o)',
                pattern,
                subject,
                result
            );
            if (result) {
                return handler.call(this, ...args);
            }
        }
        throw OTPError(route_clause);
    };
}
