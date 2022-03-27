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
        try {
            const test = compile(pattern);
            return {
                to(handler) {
                    handlers = cons(tuple(pattern, test, handler), handlers);
                },
            };
        } catch (err) {
            log('route(pattern: %o) : error : %o', pattern, err);
        }
    };
    builder(route);
    const name = builder.name || 'route';
    handlers = handlers.reverse();

    return {
        [name](...args) {
            let subject = args;
            if (args[0] instanceof Node.Context) {
                subject = args.slice(1);
            }
            for (let [pattern, test, handler] of handlers) {
                log(
                    'clauses<%o>(subject: %o, pattern: %o)',
                    name,
                    subject,
                    pattern
                );
                const result = test(subject);

                if (result) {
                    log('clauses<%o>(handler: %o)', name, handler);
                    return handler.call(this, ...args);
                }
            }
            throw OTPError(route_clause);
        },
    }[name];
}
