import { cons, list, OTPError, tuple } from '@otpjs/types';
import debug from 'debug';
import { compile } from './core';
import * as Symbols from './symbols';

const { case_clause, route_clause, skip_matching } = Symbols;
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
            for (const [pattern, handler] of handlers) {
                if (pattern(value)) {
                    return handler;
                }
            }
            throw OTPError(case_clause);
        },
        with(value) {
            for (const [pattern, handler] of handlers) {
                if (pattern(value)) {
                    return handler(value);
                }
            }
            throw OTPError(case_clause);
        }
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
            }
        };
    };
    builder(route);
    name ||= builder.name || 'route';
    handlers = handlers.reverse();

    return {
        [name](...args) {
            log('clauses(args: %o)', args);

            const subject = args.filter((arg) =>
                arg ? !arg[skip_matching] : true
            );

            log('clauses(subject: %o)', args);

            for (const [pattern, test, handler] of handlers) {
                const result = test(subject);

                if (result) {
                    return handler.call(this, ...args);
                } else {
                    log('clauses(name: %o, pattern: %o, failed)', name, pattern);
                }
            }
            throw OTPError(route_clause);
        }
    }[name];
}
