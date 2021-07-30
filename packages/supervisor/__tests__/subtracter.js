import { Symbols } from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const { ok } = Symbols;
const { noreply, reply } = gen_server.Symbols;

function init(ctx, ...initial) {
    const state = initial.reduce((acc, n) => acc - n, 0);
    return [ok, state];
}

function handleCall(ctx, call, from, state) {
    const nextState = state - call;
    return [reply, nextState, nextState];
}

function handleCast(ctx, cast, state) {
    const nextState = state - cast;
    return [noreply, nextState];
}

function handleInfo(ctx, info, state) {
    const nextState = state - info;
    return [noreply, nextState];
}

const callbacks = { init, handleCall, handleCast, handleInfo };

export function start(ctx, ...args) {
    return gen_server.start(ctx, callbacks, args)
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
