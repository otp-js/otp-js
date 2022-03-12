import { Symbols, caseOf } from '@otpjs/core';
import { t, l } from '@otpjs/types';
import * as gen_server from '@otpjs/gen_server';

const { ok } = Symbols;
const { noreply, reply } = gen_server.Symbols;

function init(ctx, ...initial) {
    const state = initial.reduce((acc, n) => acc + n, 0);
    return t(ok, state);
}

function handleCall(ctx, call, from, state) {
    const compare = caseOf(call);

    if (compare((n) => typeof n === 'number')) {
        const nextState = state + call;
        return t(reply, nextState, nextState);
    } else if (compare('get')) {
        return t(reply, state, state);
    }
}

function handleCast(ctx, cast, state) {
    const nextState = state + cast;
    return t(noreply, nextState);
}

function handleInfo(ctx, info, state) {
    const nextState = state + info;
    return t(noreply, nextState);
}

const callbacks = { init, handleCall, handleCast, handleInfo };

export function start(ctx, ...args) {
    return gen_server.start(ctx, callbacks, args);
}

export function startLink(ctx, ...args) {
    return gen_server.startLink(ctx, callbacks, args);
}

export function add(ctx, pid, n, timeout = Infinity) {
    return gen_server.call(ctx, pid, n, timeout);
}

export function incr(ctx, pid, n) {
    return gen_server.cast(ctx, pid, n);
}

export function plus(ctx, pid, n) {
    return ctx.send(pid, n);
}

export function get(ctx, pid) {
    return gen_server.call(ctx, pid, 'get');
}
