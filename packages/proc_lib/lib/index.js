import { t } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import * as Symbols from './symbols';

export { Symbols };

const { _ } = matching.Symbols;
const { init_ack } = Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('proc_lib')(...args);
}

export async function start(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawn(function start(ctx) {
        return fun(ctx, self);
    });

    log(ctx, 'start(%o) : spawned : %o', fun, spawned);

    const [, , response] = await ctx.receive(t(init_ack, spawned, _), timeout);

    return response;
}

export async function startLink(ctx, fun, timeout = 5000) {
    const self = ctx.self();
    const spawned = ctx.spawnLink(function startLink(ctx) {
        return fun(ctx, self);
    });

    log(ctx, 'startLink(%o) : spawned : %o', fun, spawned);

    const [, , response] = await ctx.receive(t(init_ack, spawned, _), timeout);

    return response;
}

export function initAck(ctx, sender, response) {
    const pid = ctx.self();
    ctx.send(sender, t(init_ack, pid, response));
}
