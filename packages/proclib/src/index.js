import debug from 'debug';

const log = debug('open-telecom:otp:procLib');

export async function start(ctx, fun, timeout = 5000) {
    const self    = ctx.self();
    const spawned = ctx.spawn((ctx) => fun(ctx, self));

    log('spawned : %O', spawned);

    await ctx.receive(({initAck, pid}) => {
        return initAck && pid === spawned;
    }, timeout);

    const ok = true;
    return {ok, pid: spawned};
}

export async function startLink(ctx, fun, timeout = 5000) {
    const self    = ctx.self();
    const spawned = ctx.spawnLink(ctx => fun(ctx, self));

    log('spawned : %O', spawned);

    await ctx.receive(({initAck, pid}) => {
        return initAck && pid === spawned;
    }, timeout);

    const ok = true;
    return {ok, pid: spawned};
}

export async function initAck(ctx, sender) {
    const initAck = true;
    const pid      = ctx.self();
    ctx.send(sender, {initAck, pid});
}
