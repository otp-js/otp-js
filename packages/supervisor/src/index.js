import debug from 'debug';
import * as core from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as Symbols from './symbols.js';

export { Symbols };

const log = debug('otpjs:supervisor');

const { ok, _, trap_exit } = core.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;

const which_children = Symbol.for('$otp.supervisor.whichChildren');
const count_children = Symbol.for('$otp.supervisor.countChildren');

async function init(ctx, callbacks, args) {
    ctx.processFlag(trap_exit, true);

    const response = await callbacks.init(ctx, ...args);
    const compare = core.caseOf(response);

    if (compare([ok, _])) {
        const [, [strategy, childSpecs]] = response;
        const children = await Promise.all(
            childSpecs.map(spec => spawnChild(ctx, spec))
        );
        return [ok, { callbacks, strategy, childSpecs, children }]
    } else if (compare([stop, _])) {
        return response;
    } else {
        return [stop, 'bad_init'];
    }
}

async function spawnChild(ctx, spec) {
    log('spawnChild(%o)', spec);
    const { id, start } = spec;
    const [fun, args] = start;

    const pid = ctx.spawnLink((ctx) => fun(ctx, ...args))

    log('spawnChild(%o) : pid : %o', spec, pid);

    return { id, pid, start };
}

function handleCall(ctx, call, from, state) {
    const compare = core.caseOf(call);

    log('call : %o', call);

    try {
        if (compare(which_children)) {
            return [reply, state.children, state];
        } else if (compare(count_children)) {
            return [reply, state.children.length, state];
        } else {
            return [noreply, state];
        }
    } catch (err) {
        log('error : %o', err);
    }
}

const callbacks = {
    init,
    handleCall
};

export function start(ctx, supCallbacks, args = []) {
    return gen_server.start(ctx, callbacks, [supCallbacks, args]);
}

export function startLink(ctx, supCallbacks, args = []) {
    return gen_server.startLink(ctx, callbacks, [supCallbacks, args]);
}

export function startChild() {
}

export function restartChild() {
}

export function deleteChild() {
}

export function terminateChild() {
}

export function whichChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, which_children, timeout);
}

export async function countChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, count_children, timeout);
}
