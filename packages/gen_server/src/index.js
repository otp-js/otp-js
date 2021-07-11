import * as ProcLib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

async function start(ctx, callbacks) {
    return ProcLib.start(ctx, initIt(callbacks));
}

async function startLink(ctx, callbacks) {
    return ProcLib.startLink(ctx, initIt(callbacks));
}

async function call(ctx, pid, message, timeout = 5000) {
    const self = ctx.self();
    const ref = ctx.ref();

    ctx.send(pid, {
        [Symbols.call]: message,
        from: { pid: self, ref },
    });

    const response = await ctx.receive((message) => {
        const { ref: replyRef } = message.from;
        if (message[Symbols.reply] && replyRef == ref)
            return true;
    }, timeout);

    return response[Symbols.reply];
}

async function cast(ctx, pid, message) {
    ctx.send(pid, { [Symbols.cast]: message });
}

async function reply(ctx, from, response) {
    ctx.send(from.pid, {
        [Symbols.reply]: response,
        from,
    });
}

function initIt(callbacks) {
    return async function initIt(ctx, caller) {
        try {
            const response = await callbacks.init(ctx);
            const { ok, state, stop, reason } = response;

            if (ok) {
                ProcLib.initAck(
                    ctx,
                    caller,
                    {
                        ok,
                        pid: ctx.self()
                    }
                );
                return enterLoop(ctx, callbacks, state);
            } else if (stop) {
                throw Error(reason);
            } else {
                throw Error('invalid_init_response');
            }
        } catch (err) {
            ProcLib.initAck(
                ctx,
                caller,
                {
                    error: true,
                    reason: err.message
                }
            )
            throw err;
        }
    };
}

async function enterLoop(ctx, callbacks, state) {
    let ok = true;
    let result = null;
    while (ok) {
        const message = await ctx.receive();

        if (message[Symbols.call]) {
            result = await handleCall(ctx, callbacks, message, state);
            state = result.state;
            ok = result.ok;
        } else if (message[Symbols.cast]) {
            result = await handleCast(ctx, callbacks, message, state);
            state = result.state;
            ok = result.ok;
        } else {
            result = await handleInfo(ctx, callbacks, message, state);
            state = result.state;
            ok = result.ok;
        }
    }
}

async function handleCall(ctx, callbacks, message, state) {
    try {
        let result = await callbacks.handleCall(ctx, message[Symbols.call], message.from, state);
        if (result.reply) {
            await reply(ctx, message.from, result.reply);
        }
        result.ok = true;
        return result;
    } catch (error) {
        const result = { ok: false, error };
        return result;
    }
}

async function handleCast(ctx, callbacks, message, state) {
    try {
        let result = await callbacks.handleCast(ctx, message[Symbols.cast], state);
        result.ok = true;
        return result;
    } catch (error) {
        const result = { ok: false, error };
        return result;
    }
}

async function handleInfo(ctx, callbacks, message, state) {
    try {
        let result = await callbacks.handleInfo(ctx, message, state);
        result.ok = true;
        return result;
    } catch (error) {
        const result = { ok: false, error };
        return result;
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
