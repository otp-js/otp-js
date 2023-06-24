import * as core from '@otpjs/core';
import { OTPError, Pid, Ref, t, l, cons } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import * as gen from '@otpjs/gen';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };
export { call, cast, enterLoop, reply, start, startLink };

function log(ctx, ...args) {
    const logger = ctx.log.extend('gen_server');
    return logger(...args);
}

const { ok, error, EXIT, normal } = core.Symbols;
const { link, nolink, $gen_cast, $gen_call } = gen.Symbols;
const { _ } = matching.Symbols;

async function start(ctx, name, callbacks, args = t()) {
    if (!t.isTuple(name) && name !== undefined) {
        args = callbacks || args;
        callbacks = name;
        name = undefined;
    }
    return gen.start(ctx, nolink, name, initializer(callbacks, args));
}

async function startLink(ctx, name, callbacks, args = t()) {
    if (!t.isTuple(name) && name !== undefined) {
        args = callbacks || args;
        callbacks = name;
        name = undefined;
    }
    return gen.start(ctx, link, name, initializer(callbacks, args));
}

async function call(ctx, pid, message, timeout = 5000) {
    return gen.call(ctx, pid, message, timeout);
}

async function cast(ctx, pid, message) {
    gen.cast(ctx, pid, message);
    return ok;
}

async function reply(ctx, to, response) {
    return gen.reply(ctx, to, response);
}

function initializer(callbacks, args) {
    const decision = matching.buildCase((is) => {
        is(t(ok, _), success);
        is(t(Symbols.stop, _), stop);
        is(_, invalid_init_response);

        function success(ctx, caller, response) {
            const [, initialState] = response;
            const state = initialState;
            proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
            return enterLoop(ctx, callbacks, state);
        }

        function stop(ctx, caller, response) {
            const [_stop, reason] = response;
            log(ctx, 'initialize(stop: %o)', reason);
            proc_lib.initAck(ctx, caller, t(error, reason));
            ctx.die(reason);
        }

        function invalid_init_response(ctx, caller, response) {
            log(ctx, 'initialize(stop: invalid_init_response)');
            throw new OTPError('invalid_init_response');
        }
    });
    return async function initialize(ctx, caller) {
        try {
            log(ctx, 'initialize(args: %o)', args);
            const response = await callbacks.init(ctx, ...args);
            const next = decision.for(response);
            return next(ctx, caller, response);
        } catch (err) {
            log(ctx, 'initialize(error: %o)', err);
            proc_lib.initAck(ctx, caller, t(error, err));
            throw err;
        }
    };
}

async function enterLoop(ctx, callbacks, state) {
    let timeout = Infinity;

    log(ctx, 'enterLoop(callbacks: %o)', callbacks);
    try {
        while (true) {
            log(ctx, 'enterLoop() : await receive()');
            const message = await ctx.receiveBlock((given, after) => {
                given(_).then((message) => message);
                after(timeout).then(() => core.Symbols.timeout);
            });
            log(ctx, 'enterLoop() : await receive() -> %o', message);
            const response = await loop(ctx, callbacks, message, state);
            log(ctx, 'enterLoop() : await loop() -> %o', response);

            const [, nextState, nextTimeout] = response;
            state = nextState;
            timeout = nextTimeout;
        }
    } catch (err) {
        log(ctx, 'enterLoop() : error : %o', err);
        const compare = matching.caseOf(err);

        if (compare(t(EXIT, _, _))) {
            const [_EXIT, _pid, reason] = err;
            await new Promise((resolve) => setTimeout(resolve));
            return ctx.die(reason);
        } else {
            return ctx.die(err);
        }
    }
}

const loop = matching.clauses(function loop(route) {
    route(_, t($gen_call, t(Pid.isPid, Ref.isRef), _), _).to(call);
    route(_, t($gen_cast, _), _).to(cast);
    route(_, _, _).to(info);

    async function call(ctx, callbacks, incoming, state) {
        const [, from, call] = incoming;
        const result = await tryHandleCall(ctx, callbacks, call, from, state);
        return handleCallReply(ctx, callbacks, from, state, result);
    }
    async function cast(ctx, callbacks, incoming, state) {
        const [, cast] = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleCast,
            cast,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state);
    }
    async function info(ctx, callbacks, incoming, state) {
        const info = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleInfo,
            info,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state);
    }
});

const replyWithNoTimeout = t(Symbols.reply, _, _);
const replyWithTimeout = t(Symbols.reply, _, _, Number.isInteger);
const noreplyWithNoTimeout = t(Symbols.noreply, _);
const noreplyWithTimeout = t(Symbols.noreply, _, Number.isInteger);
const stopNoReplyDemand = t(Symbols.stop, _, _);
const stopReplyDemand = t(Symbols.stop, _, _, _);

async function handleCallReply(ctx, callbacks, from, state, result) {
    const decision = matching.buildCase((is) => {
        is(t(ok, replyWithNoTimeout), ([ok, [, message, nextState]]) => {
            log(ctx, 'handleCallReply(from: %o, message: %o)', from, message);
            reply(ctx, from, message);
            return t(ok, nextState, Infinity);
        });
        is(t(ok, replyWithTimeout), ([ok, [, message, nextState, timeout]]) => {
            reply(ctx, from, message);
            return t(ok, nextState, timeout);
        });
        is(t(ok, noreplyWithNoTimeout), ([ok, [, nextState]]) => {
            return t(ok, nextState, Infinity);
        });
        is(t(ok, noreplyWithTimeout), ([ok, [, nextState, timeout]]) => {
            return t(ok, nextState, timeout);
        });
        is(
            t(ok, stopReplyDemand),
            async ([ok, [_stop, reason, response, nextState]]) => {
                try {
                    return await terminate(
                        ctx,
                        callbacks,
                        EXIT,
                        reason,
                        nextState,
                        Error().stack
                    );
                } catch (err) {
                    log(
                        ctx,
                        'handleCallReply(response: %o, error: %o)',
                        response,
                        err
                    );
                    reply(ctx, from, response);
                    throw err;
                }
            }
        );
        is(
            t(ok, stopNoReplyDemand),
            async ([ok, [_stop, reason, nextState]]) => {
                try {
                    return await terminate(
                        ctx,
                        callbacks,
                        EXIT,
                        reason,
                        nextState,
                        Error().stack
                    );
                } catch (err) {
                    log(ctx, 'handleCallReply(error: %o)', callbacks, err);
                    throw err;
                }
            }
        );
        is(_, (result) => {
            return handleCommonReply(ctx, callbacks, result, state);
        });
    });

    return decision.with(result);
}

const stopPattern = t(Symbols.stop, _, _);
const exitPattern = t(EXIT, _, _, _);

async function handleCommonReply(ctx, callbacks, result, state) {
    const decision = matching.buildCase((is) => {
        is(t(ok, stopPattern), async ([ok, [_stop, reason, state]]) => {
            return await terminate(ctx, callbacks, EXIT, reason, state);
        });
        is(t(ok, noreplyWithNoTimeout), async ([ok, [_noreply, nextState]]) =>
            t(ok, nextState, Infinity)
        );
        is(
            t(ok, noreplyWithTimeout),
            async ([ok, [_noreply, nextState, timeout]]) => {
                log(ctx, 'handleCommonReply() : timeout : %o', timeout);
                return t(ok, nextState, timeout);
            }
        );
        is(exitPattern, async ([_exit, type, reason, stack]) => {
            log(ctx, 'handleCommonReply(exit: %s)', stack);
            return await terminate(ctx, callbacks, type, reason, state, stack);
        });
        is(t(ok, _), async ([, badReply]) => {
            log(ctx, 'handleCommonReply(badReply: %o)', badReply);
            return await terminate(
                ctx,
                callbacks,
                EXIT,
                t('bad_return_value', badReply),
                state,
                Error().stack
            );
        });
        /* istanbul ignore next */
        is(_, async (result) => {
            log(ctx, 'handleCommonReply(badResult: %o)', result);
            return await terminate(
                ctx,
                callbacks,
                EXIT,
                t('bad_result_value', result),
                state,
                Error().stack
            );
        });
    });
    return decision.with(result);
}

async function tryHandleCall(ctx, callbacks, message, from, state) {
    try {
        return t(ok, await callbacks.handleCall(ctx, message, from, state));
    } catch (err) {
        if (err instanceof OTPError) {
            return t(EXIT, err.name, err.term, err.stack);
        } else if (err instanceof Error) {
            log(ctx, 'tryHandleCall(error: %o)', err.message);
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            /* istanbul ignore next */
            return t(ok, err);
        }
    }
}

async function tryDispatch(ctx, callback, message, state) {
    try {
        return t(ok, await callback(ctx, message, state));
    } catch (err) {
        if (err instanceof Error) {
            log(ctx, 'tryDispatch(message: %o, error: %o)', message, err);
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            return t(ok, err);
        }
    }
}

async function terminate(ctx, callbacks, type, reason, state, stack = null) {
    const response = await tryTerminate(ctx, callbacks, reason, state);

    log(ctx, 'terminate(reason: %o, response: %o)', reason, response);

    const decision = matching.buildCase((is) => {
        is(exitPattern, ([, , innerReason]) => {
            log(
                ctx,
                'terminate(reason: %o) : throw OTPError(innerReason: %o)',
                reason,
                innerReason
            );
            throw new OTPError(innerReason);
        });
        is(_, () => {
            if (reason === normal) {
                throw normal;
            } else {
                log(
                    ctx,
                    'terminate(reason: %o) : throw OTPError(reason: %o)',
                    reason,
                    reason
                );
                throw new OTPError(reason);
            }
        });
    });
    return decision.with(response);
}

async function tryTerminate(ctx, callbacks, reason, state) {
    try {
        if (callbacks.terminate) {
            log(ctx, 'tryTerminate(callbacks.terminate: %o, reason: %o)', callbacks.terminate, reason);
            await callbacks.terminate(ctx, reason, state);
            return ok;
        } else {
            log(
                ctx,
                'tryTerminate(reason: %o) : terminate not implemented',
                reason
            );
            return ok;
        }
    } catch (err) {
        if (err instanceof OTPError) {
            return t(EXIT, err.name, err.term, err.stack);
        } else if (err instanceof Error) {
            log(ctx, 'tryTerminate(reason: %o, error: %o)', reason, err);
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            return err;
        }
    }
}

export function callbacks(builder) {
    let callHandlers = l();
    let castHandlers = l();
    let infoHandlers = l();

    let init = null;
    let terminate = null;

    builder({
        onInit(handler) {
            init = handler;
        },
        onCall(pattern, handler) {
            callHandlers = cons(
                t(matching.compile(pattern), handler),
                callHandlers
            );
        },
        onCast(pattern, handler) {
            castHandlers = cons(
                t(matching.compile(pattern), handler),
                castHandlers
            );
        },
        onInfo(pattern, handler) {
            infoHandlers = cons(
                t(matching.compile(pattern), handler),
                infoHandlers
            );
        },
        onTerminate(handler) {
            terminate = handler;
        }
    });

    callHandlers = callHandlers.reverse();
    castHandlers = castHandlers.reverse();
    infoHandlers = infoHandlers.reverse();

    return {
        init,
        handleCall,
        handleCast,
        handleInfo,
        terminate
    };

    function handleCall(ctx, call, from, state) {
        const found = callHandlers.find(([pattern, _handler]) => pattern(call));
        ctx.log('handleCall(call: %o, handler: %o)', call, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, call, from, state);
        } else {
            throw new OTPError(t('unhandled_call', call));
        }
    }
    function handleCast(ctx, cast, state) {
        const found = castHandlers.find(([pattern, _handler]) => pattern(cast));
        ctx.log('handleCast(cast: %o, found: %o)', cast, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, cast, state);
        } else {
            throw new OTPError(t('unhandled_cast', cast));
        }
    }
    function handleInfo(ctx, info, state) {
        const found = infoHandlers.find(([pattern, _handler]) => pattern(info));
        ctx.log('handleInfo(info: %o, found: %o)', info, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, info, state);
        } else {
            throw new OTPError(t('unhandled_info', info));
        }
    }
}
