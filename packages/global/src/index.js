import * as otp from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { t } from '@otpjs/types';

const { ok, _ } = otp.Symbols;
const { reply, noreply } = gen_server.Symbols;
const global_name_server = Symbol.for('global_name_server');
const registrar = Symbol.for('registrar');
const $sync = Symbol.for('sync');
const all = Symbol.for('all');

const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);
    server.onCall(t(registrar, _), _forwardMethod);
});

const syncDecision = matching.buildCase((is) => {
    is(t(error, _), (ctx, [, error]) => error);
    is(_, (ctx, nodes) =>
        gen_server.call(ctx, global_name_server, t($sync, nodes), Infinity)
    );
});
export async function sync(ctx, nodes) {
    const response = await checkSyncNodes(nodes);
    const next = syncDecision.for(response);
    return next(ctx, response);
}

const checkSyncDecision = matching.buildCase((is) => {
    is(t(ok, all), (ctx) => ctx.nodes());
    is(t(ok, _), (ctx, [, groupNodes]) =>
        intersection(ctx.nodes(), groupNodes)
    );
    is(t(error, _), (ctx, [, err]) => err);
});
async function checkSyncNodes(syncNodes) {
    const own = await getOwnNodes();
    const next = checkSyncDecision.for(own);
    return next(ctx, own);
}
function _init(ctx) {
    return t(ok, {});
}

function _forwardMethod(ctx, call, from, state) {
    return t(noreply, state);
}

export function start(ctx) {
    return gen_server.start(ctx, t('local', global_name_server), callbacks, []);
}

export function startLink(ctx) {
    return gen_server.startLink(
        ctx,
        t('local', global_name_server),
        callbacks,
        []
    );
}
