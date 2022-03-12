import * as core from '@otpjs/core';
import { OTPError, Pid, Ref, t, l } from '@otpjs/types';
import { caseOf } from '@otpjs/matching';
import * as gen from '@otpjs/gen';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };
export { call, cast, enterLoop, reply, start, startLink };

const { exit } = core.Symbols;

function log(ctx, ...args) {
    const logger = ctx.log.extend('gen_server');
    return logger(...args);
}

const { ok, error, EXIT, _, normal } = core.Symbols;
const { link, nolink, monitor, $gen_cast, $gen_call } = gen.Symbols;

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
    return async function initialize(ctx, caller) {
        let state = null;
        try {
            log(ctx, 'initialize() : args : %o', args);
            const response = await callbacks.init(ctx, ...args);
            const compare = caseOf(response);
            log(ctx, 'initialize() : response : %o', response);
            if (compare(t(ok, _))) {
                const [ok, initialState] = response;
                state = initialState;
                proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
            } else if (compare(t(Symbols.stop, _))) {
                const [_stop, reason] = response;
                log(ctx, 'initialize() : stop : %o', reason);
                proc_lib.initAck(ctx, caller, t(error, reason));
                ctx.die(reason);
            } else {
                log(ctx, 'initialize() stop : invalid_init_response');
                throw new OTPError('invalid_init_response');
            }
        } catch (err) {
            log(ctx, 'initialize() : error : %o', err);
            proc_lib.initAck(ctx, caller, t(error, err));
            throw err;
        }

        // If we get this far, we haven't thrown an error.
        await enterLoop(ctx, callbacks, state);
    };
}

async function enterLoop(ctx, callbacks, state) {
    let timeout = Infinity;

    log(ctx, 'enterLoop()');
    try {
        while (true) {
            log(ctx, 'enterLoop() : await receive()');
            const message = await ctx.receive(timeout);
            log(ctx, 'enterLoop() : await receive() -> %o', message);
            const response = await loop(ctx, callbacks, message, state);

            const compare = caseOf(response);
            if (compare(t(ok, _, _))) {
                const [, nextState, nextTimeout] = response;
                state = nextState;
                timeout = nextTimeout;
            } else {
                throw new OTPError(t('bad_response', response));
            }
        }
    } catch (err) {
        log(ctx, 'enterLoop() : error : %o', err);
        const compare = core.caseOf(err);

        if (compare(t(EXIT, _, _, _))) {
            const [EXIT, pid, reason, stack] = response;
            return ctx.die(reason);
        } else if (compare(t(EXIT, _, _))) {
            const [EXIT, pid, reason] = response;
            return ctx.die(reason);
        } else {
            return ctx.die(err);
        }
    }
}

const callPattern = t($gen_call, t(Pid.isPid, Ref.isRef), _);
const castPattern = t($gen_cast, _);

async function loop(ctx, callbacks, incoming, state) {
    const compare = caseOf(incoming);
    if (compare(callPattern)) {
        const [, from, call] = incoming;
        const result = await tryHandleCall(ctx, callbacks, call, from, state);
        return handleCallReply(ctx, callbacks, from, state, result);
    } else if (compare(castPattern)) {
        const [, cast] = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleCast,
            cast,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state);
    } else {
        const info = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleInfo,
            info,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state);
    }
}

const replyWithNoTimeout = t(Symbols.reply, _, _);
const replyWithTimeout = t(Symbols.reply, _, _, Number.isInteger);
const noreplyWithNoTimeout = t(Symbols.noreply, _);
const noreplyWithTimeout = t(Symbols.noreply, _, Number.isInteger);
const stopNoReplyDemand = t(Symbols.stop, _, _);
const stopReplyDemand = t(Symbols.stop, _, _, _);

async function handleCallReply(ctx, callbacks, from, state, result) {
    const compare = caseOf(result);
    log(ctx, 'handleCallReply(%o) : result : %o', from, result);
    if (compare(t(ok, replyWithNoTimeout))) {
        const [ok, [, message, nextState]] = result;
        log(ctx, 'handleCallReply(%o) : message : %o', from, message);
        reply(ctx, from, message);
        return t(ok, nextState, Infinity);
    } else if (compare(t(ok, replyWithTimeout))) {
        const [ok, [, message, nextState, timeout]] = result;
        reply(ctx, from, message);
        return t(ok, nextState, timeout);
    } else if (compare(t(ok, noreplyWithNoTimeout))) {
        const [ok, [, nextState]] = result;
        return [ok, nextState, Infinity];
    } else if (compare(t(ok, noreplyWithTimeout))) {
        const [ok, [, nextState, timeout]] = result;
        return t(ok, nextState, timeout);
    } else if (compare([ok, stopReplyDemand])) {
        const [ok, [_stop, reason, response, nextState]] = result;
        try {
            await terminate(
                ctx,
                callbacks,
                exit,
                reason,
                nextState,
                Error().stack
            );
        } catch (err) {
            log(
                ctx,
                'handleCallReply(%o, %o) : error : %o',
                callbacks,
                response,
                err
            );
            reply(ctx, from, response);
            throw err;
        }
    } else if (compare(t(ok, stopNoReplyDemand))) {
        const [ok, [_stop, reason, nextState]] = result;
        try {
            await terminate(
                ctx,
                callbacks,
                exit,
                reason,
                nextState,
                Error().stack
            );
        } catch (err) {
            log(ctx, 'handleCallReply(%o) : error : %o', callbacks, err);
            reply(ctx, from, response);
            throw err;
        }
    } else {
        return handleCommonReply(ctx, callbacks, result, state);
    }
}

const stopPattern = t(Symbols.stop, _, _);
const exitPattern = t(EXIT, _, _, _);

async function handleCommonReply(ctx, callbacks, result, state) {
    const compare = caseOf(result);
    log(ctx, 'handleCommonReply() : result : %o', result);
    if (compare(t(ok, stopPattern))) {
        const [ok, [_stop, reason, state]] = result;
        return await terminate(ctx, callbacks, exit, reason, state);
    } else if (compare(t(ok, noreplyWithNoTimeout))) {
        const [ok, [_noreply, nextState]] = result;
        log(ctx, 'handleCommonReply() : nextState : %o', nextState);
        return t(ok, nextState, Infinity);
    } else if (compare(t(ok, noreplyWithTimeout))) {
        const [ok, [_noreply, nextState, timeout]] = result;
        log(ctx, 'handleCommonReply() : nextState : %o', nextState);
        log(ctx, 'handleCommonReply() : timeout : %o', timeout);
        return t(ok, nextState, timeout);
    } else if (compare(exitPattern)) {
        const [_exit, type, reason, stack] = result;
        log(ctx, 'handleCommonReply() : exit : %s', stack);
        return await terminate(ctx, callbacks, type, reason, state, stack);
    } else if (compare(t(ok, _))) {
        const [, badReply] = result;
        log(ctx, 'handleCommonReply() : badReply : %o', badReply);
        return await terminate(
            ctx,
            callbacks,
            exit,
            t('bad_return_value', badReply),
            state,
            Error().stack
        );
    } else {
        log(ctx, 'handleCommonReply() : badResult : %o', result);
        return await terminate(
            ctx,
            callbacks,
            exit,
            t('bad_result_value', result),
            state,
            Error().stack
        );
    }
}

async function tryHandleCall(ctx, callbacks, message, from, state) {
    try {
        return t(ok, await callbacks.handleCall(ctx, message, from, state));
    } catch (err) {
        if (err instanceof Error) {
            log(ctx, 'tryHandleCall() : error : %o', err.message);
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            return t(ok, err);
        }
    }
}

async function tryDispatch(ctx, callback, message, state) {
    try {
        return t(ok, await callback(ctx, message, state));
    } catch (err) {
        if (err instanceof Error) {
            log(
                ctx,
                'tryDispatch(%o, %o) : error : %o',
                callback,
                message,
                err
            );
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            return t(ok, err);
        }
    }
}

async function terminate(ctx, callbacks, type, reason, state, stack = null) {
    const response = await tryTerminate(
        ctx,
        callbacks,
        t(type, reason, stack),
        state
    );

    log(ctx, 'terminate(%o) : response : %o', reason, response);

    const compare = caseOf(response);
    if (compare(exitPattern)) {
        const [, , innerReason] = response;
        log(
            ctx,
            'terminate(%o) : exitPattern<%o> : throw OTPError(%o)',
            reason,
            innerReason
        );
        throw new OTPError(reason);
    } else {
        if (reason === normal) {
            throw normal;
        } else {
            log(ctx, 'terminate(%o) : throw OTPError(%o)', reason, reason);
            throw new OTPError(reason);
        }
    }
}

async function tryTerminate(ctx, callbacks, reason, state) {
    try {
        if ('terminate' in callbacks) {
            return callbacks.terminate(ctx, reason, state);
        } else {
            log(ctx, 'tryTerminate(%o) : terminate not implemented', reason);
            return ok;
        }
    } catch (err) {
        if (err instanceof Error) {
            log(ctx, 'tryTerminate(%o) : error : %o', reason, err);
            return t(EXIT, err.name, err.message, err.stack);
        } else {
            return t(ok, err);
        }
    }
}

export function callbacks(builder) {
    const callHandlers = l();
    const castHandlers = l();
    const infoHandlers = l();

    let init = null;
    let terminate = null;

    builder({
        onInit(handler) {
            init = handler;
        },
        onCall(pattern, handler) {
            callHandlers.push([core.compile(pattern), handler]);
        },
        onCast(pattern, handler) {
            castHandlers.push([core.compile(pattern), handler]);
        },
        onInfo(pattern, handler) {
            infoHandlers.push([core.compile(pattern), handler]);
        },
        onTerminate(handler) {
            terminate = handler;
        },
    });

    return {
        init,
        handleCall,
        handleCast,
        handleInfo,
        terminate,
    };

    function handleCall(ctx, call, from, state) {
        const found = callHandlers.find(([pattern, _handler]) => pattern(call));
        ctx.log('handleCall(%o) : handler : %o', call, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, call, from, state);
        } else {
            throw new OTPError(t('unhandled_call', call));
        }
    }
    function handleCast(ctx, cast, state) {
        const found = castHandlers.find(([pattern, _handler]) => pattern(cast));
        ctx.log('handleCast(%o) : handler : %o', cast, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, cast, state);
        } else {
            throw new OTPError(t('unhandled_cast', cast));
        }
    }
    function handleInfo(ctx, info, state) {
        const found = infoHandlers.find(([pattern, _handler]) => pattern(info));
        ctx.log('handleInfo(%o) : handler : %o', info, found);

        if (found) {
            const [, handler] = found;
            return handler(ctx, info, state);
        } else {
            throw new OTPError(t('unhandled_info', info));
        }
    }
}
