import {Pid, Symbols, match} from '@otpjs/core';

const { ok, _ } = Symbols;
const INIT_ACK = Symbol.for('otp.proc_lib.init_ack');


export async function start(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawn((ctx) => fun(ctx, self));

    const [, , response] = await ctx.receive(
        [[INIT_ACK, spawned, _]],
        timeout
    );

    return response;

}

export async function startLink(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawnLink(ctx => fun(ctx, self));

    const [, , response] = await ctx.receive(
        [[INIT_ACK, spawned, _]],
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
