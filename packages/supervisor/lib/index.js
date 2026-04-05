import * as core from '@otpjs/core';
import {
    ok,
    trap_exit,
    EXIT,
    DOWN,
    error,
    normal,
    kill,
    killed,
} from '@otpjs/core/symbols';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { Pid, t, l, cons, cdr, car, List, OTPError } from '@otpjs/types';
import {
    which_children,
    count_children,
    temporary,
    transient,
    permanent,
    start_children,
    delete_child,
    start_child,
    restart_child,
    terminate_child,
} from '#symbols';
export * as Symbols from '#symbols';
import { getStrategy } from './strategy/index.js';

function log(ctx, ...args) {
    return ctx.log.extend('supervisor')(...args);
}

const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const { kase } = matching;

async function _init(ctx, [name, callbacks, args]) {
    ctx.processFlag(trap_exit, true);

    if (!name) name = ctx.self();

    log(ctx, 'init(name: %o)', name);

    const response = await callbacks.init(ctx, ...args);
    return kase(response).of((matches) => {
        matches(t(ok, _)).then(([, [options, childSpecs]]) => {
            ctx.send(ctx.self(), start_children);
            const strategy = getStrategy(options.strategy);
            const initialState = {
                callbacks,
                name,
                ...options,
                strategy,
                childSpecs,
            };
            log(ctx, '_init(initialState: %o)', initialState);
            return t(ok, initialState);
        });
        matches(t(stop, _)).then((response) => {
            return response;
        });
        matches(_).then(() => {
            return t(stop, 'bad_init');
        });
    });
}
async function _whichChildren(ctx, call, from, state) {
    return t(
        reply,
        t(
            ok,
            l(
                ...Array.from(state.children).map(({ pid, id }) => ({
                    pid,
                    id,
                }))
            )
        ),
        state
    );
}
async function _countChildren(ctx, call, from, state) {
    return t(reply, state.children.length(), state);
}
async function _startChild(ctx, [, specOrArgs], from, state) {
    const { strategy } = state;

    try {
        return await strategy.startChild(ctx, specOrArgs, state);
    } catch (err) {
        log(ctx, '_startChild(error: %o)', err);
        return t(reply, t(error, err.term), state);
    }
}
async function _handleCall(ctx, call, from, state) {
    log(ctx, 'handleCall(%o) : unhandled', call);
    return t(noreply, state);
}

async function _handleCast(ctx, cast, state) {
    return t(noreply, state);
}

async function _handleEXIT(ctx, [, pid, reason, _stack], state) {
    log(ctx, '_handleEXIT(pid: %o, reason: %o)', pid, reason);
    const [, nextState] = await restart(ctx, pid, reason, state);
    return t(noreply, nextState);
}
async function _handleInfo(ctx, info, state) {
    return t(noreply, state);
}
async function _startChildren(ctx, _info, state) {
    const { strategy } = state;
    log(ctx, '_startChildren(childSpecs: %o)', state.childSpecs);
    const [, children] = await strategy.startChildren(ctx, state.childSpecs);
    return t(noreply, { ...state, children });
}

const isPermanent = matching.compile({ restart: permanent, [spread]: _ });
const isTransient = matching.compile({ restart: transient, [spread]: _ });
const isNormal = matching.compile(normal);
function restart(ctx, pid, reason, state) {
    const { strategy } = state;

    let node = state.children;
    let index = 0;
    const matchesPid = core.compile({ pid, [spread]: _ });

    while (l.isList(node) && node !== l.nil && !matchesPid(car(node))) {
        node = cdr(node);
        index++;
    }

    log(ctx, 'restart(node: %o)', node);

    if (node !== l.nil) {
        const child = car(node);
        if (isPermanent(child) || (isTransient(child) && !isNormal(reason))) {
            log(
                ctx,
                'restart(permanent_or_abnormal_transient, child: %o)',
                child
            );
            return strategy.restart(ctx, state, child.id, pid);
        } else {
            log(ctx, 'restart(temporary_cleanup, child: %o)', child);
            return strategy.cleanup(ctx, state, index);
        }
    } else {
        return t(ok, state);
    }
}

async function _restartChild(ctx, [restart_child, id], from, state) {
    const { children, strategy } = state;
    const matchesId = matching.compile({ id, [spread]: _ });
    let node = children;
    while (l.isList(node) && node !== l.nil && !matchesId(car(node))) {
        node = cdr(node);
    }
    if (node !== l.nil) {
        const child = car(node);
        ctx.unlink(child.pid);
        ctx.exit(child, kill);
    }

    const [, nextPid, nextState] = await strategy.restart(ctx, state, id);
    return t(reply, t(ok, nextPid), nextState);
}
const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);

    server.onCall(which_children, _whichChildren);
    server.onCall(count_children, _countChildren);
    server.onCall(t(start_child, _), _startChild);
    server.onCall(t(restart_child, _), _restartChild);
    server.onCall(_, _handleCall);

    server.onCast(_, _handleCast);

    server.onInfo(t(EXIT, Pid.isPid, _, _), _handleEXIT);
    server.onInfo(t(EXIT, Pid.isPid, _), _handleEXIT);
    server.onInfo(start_children, _startChildren);
    server.onInfo(_, _handleInfo);

    server.onTerminate((ctx, reason, state) => {
        log(ctx, 'terminate(reason: %o)', reason);
        return t(ok, state);
    });
});

export async function startLink(ctx, name, supCallbacks, args = l()) {
    if (!t.isTuple(name) && name !== undefined) {
        args = supCallbacks || args;
        supCallbacks = name;
        name = undefined;
    }
    ctx.log('startLink(name: %o, args: %o)', name, args);
    return gen_server.startLink(
        ctx,
        name,
        callbacks,
        l(t(name, supCallbacks, args))
    );
}
export async function startChild(ctx, pid, args) {
    return gen_server.call(ctx, pid, t(start_child, args));
}
export async function restartChild(ctx, pid, id) {
    return gen_server.call(ctx, pid, t(restart_child, id));
}
export async function deleteChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, t(delete_child, target));
}
export async function terminateChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, t(terminate_child, target));
}
export async function whichChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, which_children, timeout);
}
export async function countChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, count_children, timeout);
}
