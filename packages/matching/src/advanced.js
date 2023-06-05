import debug from 'debug';
import { OTPError, Pid, Ref, tuple, list, cons } from '@otpjs/types';
import * as Symbols from './symbols';
import { compile } from './core';

const { _, spread, case_clause, route_clause, skip_matching } = Symbols;
const badarg = Symbol.for('badarg');

const log = debug('otpjs:matching:advanced');

export function buildCase(builder) {
    let handlers = list.nil;

    builder((pattern, handler) => {
        log('buildCase(pattern: %o, handler: %o)', pattern, handler);
        if (handler instanceof Function) {
            const compiled = compile(pattern);
            handlers = cons(tuple(compiled, handler), handlers);
        } else {
            log(
                'buildCase(pattern: %o, handler: %o, isFunction: %o)',
                pattern,
                handler,
                handler instanceof Function
            );
            throw OTPError(badarg);
        }
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
export function clauses(builder, name) {
    let handlers = list.nil;
    const route = (...pattern) => {
        const test = compile(pattern);
        return {
            to(handler) {
                if (handler instanceof Function) {
                    handlers = cons(tuple(pattern, test, handler), handlers);
                } else {
                    throw OTPError(badarg);
                }
            },
        };
    };
    builder(route);
    name ||= builder.name || 'route';
    handlers = handlers.reverse();

    return {
        [name](...args) {
            log('clauses(args: %o)', args);

            let subject = args.filter((arg) =>
                arg ? !arg[skip_matching] : true
            );

            log('clauses(subject: %o)', args);

            for (let [pattern, test, handler] of handlers) {
                log('clauses(name: %o, pattern: %o)', name, pattern);
                const result = test(subject);

                if (result) {
                    log('clauses(name: %o, handler: %o)', name, handler);
                    return handler.call(this, ...args);
                }
            }
            throw OTPError(route_clause);
        },
    }[name];
}
