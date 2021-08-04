import * as Core from '@otpjs/core';
import { caseOf, OTPError, Pid, Ref } from '@otpjs/core';
import { exit } from '@otpjs/core/lib/symbols';
import * as gen from '@otpjs/gen';
import * as ProcLib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };
export {
    call,
    cast,
    enterLoop,
    reply,
    start,
    startLink,
};

function log(ctx, ...args) {
    const logger = ctx.log.extend('gen_server');
    return logger(...args);
}

const { ok, error, EXIT, _ } = Core.Symbols;
const { noreply } = Symbols;
const { link, nolink, monitor } = gen.Symbols;

async function start(ctx, name, callbacks, args = []) {
    if (typeof name === 'object') {
        args = callbacks || args;
        callbacks = name;
        name = undefined;
    }
    return gen.start(ctx, nolink, name, initializer(callbacks, args));
}

async function startLink(ctx, name, callbacks, args = []) {
    if (typeof name === 'object') {
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
            if (compare([ok, _])) {
                const [ok, initialState] = response;
                state = initialState;
                ProcLib.initAck(
                    ctx,
                    caller,
                    [ok, ctx.self()]
                )
            } else if (compare([Symbols.stop, _])) {
                const [_stop, reason] = response;
                log(ctx, 'initialize() : stop : %o', reason);
                throw new OTPError(reason);
            } else {
                log(ctx, 'initialize() stop : invalid_init_response');
                throw new OTPError('invalid_init_response')
            }
        } catch (err) {
            log(ctx, 'initialize() : error : %o', err);
            ProcLib.initAck(
                ctx,
                caller,
                [error, err.name, err.message, err.stack]
            );
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
            const message = await ctx.receive(timeout);
            const response = await loop(ctx, callbacks, message, state);

            const compare = caseOf(response);
            if (compare([ok, _, _])) {
                const [, nextState, nextTimeout] = response;
                state = nextState;
                timeout = nextTimeout;
            } else {
                throw new OTPError(['bad_response', response]);
            }
        }
    } catch (err) {
        log(ctx, 'enterLoop() : error : %o', err);
        const response = await tryTerminate(ctx, callbacks, err, state);
        const compare = Core.caseOf(response);

        if (compare([EXIT, _, _, _])) {
            const [EXIT, pid, reason, stack] = response;
            ctx.die(reason)
        }
    }
}

const callPattern = [gen.Symbols.call, [Pid.isPid, Ref.isRef], _];
const castPattern = [gen.Symbols.cast, _]

async function loop(ctx, callbacks, incoming, state) {
    const compare = caseOf(incoming);
    if (compare(callPattern)) {
        const [, from, call] = incoming;
        const result = await tryHandleCall(
            ctx,
            callbacks,
            call,
            from,
            state
        );
        return handleCallReply(ctx, callbacks, from, state, result);
    } else if (compare(castPattern)) {
        const [, cast] = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleCast,
            cast,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state)
    } else {
        const info = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleInfo,
            info,
            state
        );
        return handleCommonReply(ctx, callbacks, result, state)
    }
}

const replyWithNoTimeout = [Symbols.reply, _, _];
const replyWithTimeout = [Symbols.reply, _, _, Number.isInteger];
const noreplyWithNoTimeout = [noreply, _];
const noreplyWithTimeout = [noreply, _, Number.isInteger];
const stopDemand = [Symbols.stop, _, _, _];

async function handleCallReply(ctx, callbacks, from, state, result) {
    const compare = caseOf(result);
    log(ctx, 'handleCallReply(%o) : result : %o', from, result);
    if (compare([ok, replyWithNoTimeout])) {
        const [ok, [, message, nextState]] = result;
        log(ctx, 'handleCallReply(%o) : message : %o', from, message);
        reply(ctx, from, message);
        return [ok, nextState, Infinity];
    } else if (compare([ok, replyWithTimeout])) {
        const [ok, [, message, nextState, timeout]] = result;
        reply(ctx, from, message);
        return [ok, nextState, timeout];
    } else if (compare([ok, noreplyWithNoTimeout])) {
        const [ok, [, nextState]] = result;
        return [ok, nextState, Infinity];
    } else if (compare([ok, noreplyWithTimeout])) {
        const [ok, [, nextState, timeout]] = result;
        return [ok, nextState, timeout];
    } else if (compare([ok, stopDemand])) {
        const [ok, [_stop, reason, response, nextState]] = result;
        try {
            await terminate(ctx, callbacks, exit, reason, nextState, Error().stack);
        } catch (err) {
            log(ctx, 'handleCallReply(%o, %o) : error : %o', callbacks, response, err);
            reply(ctx, from, response);
            throw err;
        }
    } else {
        return handleCommonReply(
            ctx,
            callbacks,
            result,
            state
        );
    }
}

const stopPattern = [Symbols.stop, _, _];
const exitPattern = [EXIT, _, _, _];

async function handleCommonReply(ctx, callbacks, result, state) {
    const compare = caseOf(result);
    log(ctx, 'handleCommonReply() : result : %o', result);
    if (compare([ok, stopPattern])) {
        const [ok, [_stop, reason, state]] = result;
        return await terminate(
            ctx,
            callbacks,
            exit,
            reason,
            state
        )
    } else if (compare([ok, noreplyWithNoTimeout])) {
        const [ok, [_noreply, nextState]] = result;
        log(ctx, 'handleCommonReply() : nextState : %o', nextState);
        return [
            ok,
            nextState,
            Infinity,
        ];
    } else if (compare([ok, noreplyWithTimeout])) {
        const [ok, [_noreply, nextState, timeout]] = result;
        log(ctx, 'handleCommonReply() : nextState : %o', nextState);
        log(ctx, 'handleCommonReply() : timeout : %o', timeout);
        return [
            ok,
            nextState,
            timeout
        ];
    } else if (compare(exitPattern)) {
        const [_exit, type, reason, stack] = result;
        log(ctx, 'handleCommonReply() : exit : %s', stack)
        return await terminate(
            ctx,
            callbacks,
            type,
            reason,
            state,
            stack
        );
    } else if (compare([ok, _])) {
        const [, badReply] = result;
        log(ctx, 'handleCommonReply() : badReply : %o', badReply);
        return await terminate(
            ctx,
            callbacks,
            exit,
            ['bad_return_value', badReply],
            state,
            Error().stack
        );
    }
}

async function tryHandleCall(ctx, callbacks, message, from, state) {
    try {
        return [ok, await callbacks.handleCall(ctx, message, from, state)];
    } catch (err) {
        if (err instanceof Error) {
            log(ctx, 'tryHandleCall() : error : %o', err.message);
            return [EXIT, err.name, err.message, err.stack];
        } else {
            return [ok, err];
        }
    }
}

async function tryDispatch(ctx, callback, message, state) {
    try {
        return [ok, await callback(ctx, message, state)];
    } catch (err) {
        if (err instanceof Error) {
            log(ctx, 'tryDispatch(%o, %o) : error : %o', callback, message, err);
            return [EXIT, err.name, err.message, err.stack];
        } else {
            return [ok, err];
        }
    }
}

async function terminate(ctx, callbacks, type, reason, state, stack = null) {
    const response = await tryTerminate(
        ctx,
        callbacks,
        [type, reason, stack],
        state
    );

    log(ctx, 'terminate() : response : %o', response);

    const compare = caseOf(response);
    if (compare(exitPattern)) {
        const [, , innerReason] = response;
        log(ctx, 'terminate(%o) : exitPattern<%o> : throw OTPError(%o)', reason, innerReason);
        throw new OTPError(reason);
    } else {
        log(ctx, 'terminate(%o) : throw OTPError(%o)', reason)
        throw new OTPError(reason);
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
            return [
                EXIT,
                err.name,
                err.message,
                err.stack
            ]
        } else {
            return [ok, err];
        }
    }
}


