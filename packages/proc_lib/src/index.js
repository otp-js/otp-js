import { Pid, Symbols, match } from '@otpjs/core';

const { ok, _ } = Symbols;
const INIT_ACK = Symbol.for('otp.proc_lib.init_ack');

function log(ctx, ...args) {
    return ctx.log.extend('proc_lib')(...args);
}

export async function start(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawn(function start(ctx) {
        return fun(ctx, self);
    });

    log(ctx, 'start(%o) : spawned : %o', fun, spawned);

    const [, , response] = await ctx.receive(
        [[INIT_ACK, spawned, _]],
        timeout
    );

    return response;

}

export async function startLink(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawnLink(function startLink(ctx) {
        return fun(ctx, self)
    });

    log(ctx, 'startLink(%o) : spawned : %o', fun, spawned);

    const [, , response] = await ctx.receive(
        [INIT_ACK, spawned, _],
        timeout
    );

    return response;
}

export function initAck(ctx, sender, response) {
    const pid = ctx.self();
    ctx.send(sender, [
        INIT_ACK,
        pid,
        response
    ]);
}
