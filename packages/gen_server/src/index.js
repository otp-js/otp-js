import * as ProcLib from '@otpjs/proc_lib';
import * as Core from '@otpjs/core';
import * as Symbols from './symbols';
import { OTPError, Pid, caseOf, Ref } from '@otpjs/core';
import { exit, normal } from '@otpjs/core/lib/symbols';

export { Symbols };

const { ok, error, EXIT, _ } = Core.Symbols;
const { noreply } = Symbols;

async function start(ctx, callbacks) {
    return ProcLib.start(ctx, initializer(callbacks));
}

async function startLink(ctx, callbacks) {
    return ProcLib.startLink(ctx, initializer(callbacks));
}

const callReplyPattern = ref => [
    Symbols.reply,
    ref,
    Core.Symbols._
];
async function call(ctx, pid, message, timeout = 5000) {
    const self = ctx.self();
    const ref = ctx.ref();

    try {
        ctx.send(pid, [
            Symbols.call,
            [self, ref],
            message
        ]);

        const [, , ret] = await ctx.receive(
            [callReplyPattern(ref)],
            timeout
        );

        return ret;
    } catch (err) {
        throw new OTPError([
            EXIT,
            self,
            err.message,
            err.stack
        ]);
    }
}

async function cast(ctx, pid, message) {
    ctx.send(pid, [Symbols.cast, message]);
    return ok;
}

async function reply(ctx, [pid, ref], response) {
    ctx.send(pid, [
        Symbols.reply,
        ref,
        response
    ]);
}

function initializer(callbacks) {
    return async function initialize(ctx, caller) {
        try {
            const response = await callbacks.init(ctx);
            const compare = caseOf(response);
            if (compare([ok, _])) {
                const [ok, state] = response;
                ProcLib.initAck(
                    ctx,
                    caller,
                    [ok, ctx.self()]
                )
                return enterLoop(ctx, callbacks, state);
            } else if (compare([Symbols.stop, _])) {
                const [_stop, reason] = response;
                throw new OTPError(reason);
            } else {
                throw new OTPError([
                    EXIT,
                    'Error',
                    'invalid_init_response',
                    Error().stack
                ])
            }
        } catch (err) {
            ProcLib.initAck(
                ctx,
                caller,
                [error, err.name, err.message, err.stack]
            );
            throw err;
        }
    };
}

async function enterLoop(ctx, callbacks, state) {
    let running = true;
    let timeout = Infinity;

    while (running) {
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
}

const callPattern = [Symbols.call, [Pid.isPid, Ref.isRef], _];
const castPattern = [Symbols.cast, _]

async function loop(ctx, callbacks, incoming, state) {
    const compare = caseOf(incoming);
    if (compare(callPattern)) {
        const [, from, message] = incoming;
        const result = await tryHandleCall(
            ctx,
            callbacks,
            message,
            from,
            state
        );
        return handleCallReply(ctx, callbacks, from, state, result);
    } else if (compare(castPattern)) {
        const [, message] = incoming;
        const result = await tryDispatch(
            ctx,
            callbacks.handleCast,
            message,
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
const replyWithTimeout = [Symbols.reply, _, _, (num) => typeof num === 'number'];
const noreplyWithNoTimeout = [noreply, _];
const noreplyWithTimeout = [noreply, _, (num) => typeof num === 'number'];
const stopDemand = [Symbols.stop, _, _, _];

async function handleCallReply(ctx, callbacks, from, state, result) {
    const compare = caseOf(result);
    if (compare([ok, replyWithNoTimeout])) {
        const [ok, [, message, nextState]] = result;
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
        } catch(err) {
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
    if (compare([ok, stopPattern])) {
        const [ok, [_stop, reason, state]] = result;
        await terminate(
            ctx,
            callbacks,
            exit,
            reason,
            state
        )
    } else if (compare([ok, noreplyWithNoTimeout])) {
        const [ok, [_noreply, nextState]] = result;
        return [
            ok,
            nextState,
            Infinity,
        ];
    } else if (compare([ok, noreplyWithTimeout])) {
        const [ok, [_noreply, nextState, timeout]] = result;
        return [
            ok,
            nextState,
            timeout
        ];
    } else if (compare(exitPattern)) {
        const [_exit, type, reason, stack] = result;
        await terminate(
            ctx,
            callbacks,
            type,
            reason,
            state,
            stack
        );
    } else if (compare([ok, _])) {
        const [, badReply] = result;
        await terminate(
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
        return [ok, callbacks.handleCall(ctx, message, from, state)];
    } catch (err) {
        if (err instanceof Error) {
            return [EXIT, err.name, err.message, err.stack];
        } else {
            return [ok, err];
        }
    }
}

async function tryDispatch(ctx, callback, message, state) {
    try {
        return [ok, callback(ctx, message, state)];
    } catch (err) {
        if (err instanceof Error) {
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

    const compare = caseOf(response);
    if (compare(exitPattern)) {
        throw new OTPError(response);
    } else {
        throw new OTPError([
            EXIT,
            type,
            reason,
            stack
        ]);
    }
}

async function tryTerminate(ctx, callbacks, reason, state) {
    try {
        if ('terminate' in callbacks) {
            return callbacks.terminate(ctx, reason, state);
        } else {
            return ok;
        }
    } catch (err) {
        if (err instanceof Error) {
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

export {
    call,
    cast,
    enterLoop,
    reply,
    start,
    startLink,
};
