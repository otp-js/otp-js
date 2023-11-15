import * as core from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { Pid, t, l, cons, cdr, car, List, OTPError } from '@otpjs/types';
import * as Symbols from './symbols.js';

export { Symbols };

function log(ctx, ...args) {
    return ctx.log.extend('supervisor')(...args);
}

const { ok, trap_exit, EXIT, DOWN, error, normal, kill, killed } = core.Symbols;
const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const {
    which_children,
    count_children,
    temporary,
    transient,
    permanent,
    restarting,
    brutal_kill,
    failed_to_start_child,
    shutdown,
    ignore,
} = Symbols;
const RESTARTING = (pid) => t(restarting, pid);

const remove = Symbol.for('remove');
const start_children = Symbol.for('start_children');
const start_child = Symbol.for('start_child');
const restart_child = Symbol.for('restart_child');

const MAX_RETRIES = 10;

async function _init(ctx, [name, callbacks, args]) {
    ctx.processFlag(trap_exit, true);

    if (!name) name = ctx.self();

    log(ctx, 'init(name: %o)', name);

    const response = await callbacks.init(ctx, ...args);
    const compare = core.caseOf(response);

    if (compare(t(ok, _))) {
        const [, [options, childSpecs]] = response;
        log(
            ctx,
            'init(name: %o, options: %o, childSpecs: %o)',
            name,
            options,
            childSpecs
        );
        ctx.send(ctx.self(), start_children);
        return t(ok, { callbacks, name, ...options, childSpecs });
    } else if (compare(t(stop, _))) {
        const [, reason] = response;
        log(ctx, 'init(name: %o, stop: %o)', name, reason);
        return response;
    } else {
        log(ctx, 'init(name: %o, bad_init: %o)', name, response);
        return t(stop, 'bad_init');
    }
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

    log(ctx, '_startChild(%o, %o)', state.strategy, specOrArgs);

    try {
        if (isSimpleOneForOne(strategy)) {
            log(
                ctx,
                '_startChild(simple_one_for_one, %o) : state : %o',
                specOrArgs,
                state
            );
            const [base] = state.childSpecs;
            const [start, args] = base.start;
            log(
                ctx,
                '_startChild(simple_one_for_one, %o) : doStartChild()',
                specOrArgs
            );
            const result = await _doStartChild(ctx, {
                ...base,
                start: t(start, l(...args, ...specOrArgs)),
                restart: base.restart,
            });
            log(
                ctx,
                '_startChild(simple_one_for_one, %o) : result : %o',
                specOrArgs,
                result
            );

            const compare = core.caseOf(result);
            if (compare(t(ok, { pid: Pid.isPid, [spread]: _ }))) {
                const [, child] = result;
                const { pid } = child;
                const id = pid.toString();
                const nextState = {
                    ...state,
                    children: cons({ ...child, id }, state.children),
                };
                return _handleStartResult(t(ok, pid, nextState), nextState);
            } else if (compare(t(ok, { pid: null, [spread]: _ }))) {
                return _handleStartResult(t(ok, undefined, state), state);
            } else if (compare(t(ok, undefined))) {
                return _handleStartResult(t(ok, undefined, state), state);
            }
        } else {
            log(
                ctx,
                '_startChild(%o, %o) : doStartChild()',
                strategy,
                specOrArgs
            );
            const result = await _doStartChild(ctx, specOrArgs);
            const compare = matching.caseOf(result);

            if (compare(t(ok, _))) {
                const [, child] = result;
                const nextChildren = state.children.replaceWhere(
                    ({ id }) => id === specOrArgs.id,
                    child,
                    true
                );
                const nextState = {
                    ...state,
                    children: nextChildren,
                };
                return _handleStartResult(t(ok, child.pid, nextState), state);
            } else {
                log(ctx, '_startChild(simple_one_for_one, result: %o)', result);
                return _handleStartResult(result, state);
            }
        }
    } catch (err) {
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
    const [, nextState] = await doRestart(ctx, pid, reason, state);
    return t(noreply, nextState);
}
async function _handleInfo(ctx, info, state) {
    return t(noreply, state);
}
async function _startChildren(ctx, _info, state) {
    const { strategy, childSpecs } = state;
    const compare = core.caseOf(strategy);

    if (compare(Symbols.simple_one_for_one)) {
        return t(noreply, { ...state, children: l() });
    } else {
        const [, children] = await doStartChildren(
            ctx,
            childSpecs,
            '_startChildren'
        );
        return t(noreply, { ...state, children });
    }
}
async function _doStartChild(ctx, spec, retries = 0) {
    log(ctx, '_doStartChild(spec.id: %o, retries: %o)', spec.id, retries);

    if (retries >= MAX_RETRIES) {
        throw OTPError(t('cannot_start', spec.id, 'max_retries'));
    }

    const { id, restart } = spec;
    const [start, args] = spec.start;

    log(ctx, '_doStartChild(spec.id: %o)', spec.id);

    const response = await start(ctx, ...args);
    const compare = core.caseOf(response);

    log(ctx, '_doStartChild(spec.id: %o, response: %o)', spec.id, response);
    if (compare(t(ok, Pid.isPid))) {
        const [, pid] = response;
        return t(ok, { ...spec, args, pid });
    } else if (compare(ignore)) {
        if (restart === temporary) {
            return t(ok, undefined);
        } else {
            return t(ok, { ...spec, pid: null });
        }
    } else if (compare(t(error, _))) {
        const [, reason] = response;

        log(ctx, '_doStartChild(spec.id: %o, reason: %o)', spec.id, reason);

        if (restart === temporary) {
            return response;
        } else if (restart === permanent || reason !== normal) {
            log(
                ctx,
                '_doStartChild(spec.id: %o, retries: %o)',
                spec.id,
                retries + 1
            );
            return _doStartChild(ctx, spec, retries + 1);
        }
    } else {
        throw new OTPError(t('cannot_start', spec.id, response));
    }
}
async function _handleStartResult(result, state) {
    const compare = core.caseOf(result);
    if (compare(t(ok, _, _))) {
        const [, response, nextState] = result;
        return t(reply, t(ok, response), nextState);
    } else {
        return t(reply, result, state);
    }
}

const isSimpleOneForOne = core.compile(Symbols.simple_one_for_one);
const isOneForOne = core.compile(Symbols.one_for_one);
const isOneForAll = core.compile(Symbols.one_for_all);
const isRestForOne = core.compile(Symbols.rest_for_one);
async function doSimpleOneForOneRestart(ctx, state, id, pid) {
    log(
        ctx,
        'doSimpleOneForOneRestart(id: %o, children: %o, specs: %o)',
        id,
        state.children,
        state.childSpecs
    );
    const child = state.children.find((child) => child.id === id);
    const { args } = child;

    const base = state.childSpecs.nth(0);
    log(ctx, 'doSimpleOneForOneRestart(base: %o)', base);
    const spec = { ...base, start: t(base.start[0], args) };
    const [, newSpec] = await _doStartChild(ctx, spec);

    return t(ok, updatePid(state, id, newSpec.pid));
}
async function doOneForOneRestart(ctx, state, id, pid) {
    const [, newSpec] = await _doStartChild(
        ctx,
        getSpecById(ctx, id, state.childSpecs)
    );
    return t(ok, updatePid(state, id, newSpec.pid));
}
async function doOneForAllRestart(ctx, state, id, pid) {
    let { name, children } = state;
    const child = _findChildById(id, children);
    children = _deleteChild(ctx, id, children);

    log(ctx, 'doOneForAllRestart(child.id: %o)', child.id);

    const [result, nextChildren] = await restartMultipleChildren(
        ctx,
        child,
        children,
        name
    );

    log(ctx, 'doOneForAllRestart(child.id: %o, result: %o)', child.id, result);

    return t(result, { ...state, children: nextChildren });
}
async function doRestForOneRestart(ctx, state, id, pid) {
    const { name, children } = state;
    const [before, after] = _splitChild(id, children);
    const [child] = after;

    const [result, nextChildren] = await restartMultipleChildren(
        ctx,
        child,
        after,
        name
    );
    return t(result, { ...state, children: before.append(nextChildren) });
}
async function restartMultipleChildren(ctx, child, children, name) {
    log(
        ctx,
        'restartMultipleChildren(child.id: %o) : pre_terminate_children',
        child.id
    );
    children = await terminateChildren(ctx, children, name);
    log(
        ctx,
        'restartMultipleChildren(child.id: %o) : pre_start_children',
        child
    );

    const result = await doStartChildren(ctx, children, name);
    const compare = matching.caseOf(result);

    log(
        ctx,
        'restartMultipleChildren(child.id: %o, result: %o) : post_start_children',
        child.id,
        result
    );

    if (compare(t(ok, _))) {
        return result;
    } else if (compare(t(error, t(failed_to_start_child, _, _)))) {
        const [, children, [, failedId]] = result;

        const newPid =
            failedId != child.id
                ? _restarting(child.pid)
                : RESTARTING(undefined);
        return t(t(try_again, failedId), setPid(newPid, failedId, children));
    }
}
async function doStartChildren(ctx, children, name) {
    const start = async (child) => {
        const response = await _doStartChild(ctx, child);
        const compare = matching.caseOf(response);

        if (compare(t(ok, undefined)) && isTemporary(child)) {
            return remove;
        } else if (compare(t(ok, _))) {
            const [, { pid }] = response;
            return { ...child, pid };
        } else if (compare(t(ok, _, _))) {
            const [, { pid }] = response;
            return { ...child, pid };
        } else if (compare(t(error, _))) {
            const [, reason] = response;
            log(
                ctx,
                'doStartChildren(name: %o) : start(child: %o)',
                name,
                child
            );
            throw OTPError(t(failed_to_start_child, child.id, reason));
        }
    };

    children = await children.map(start);
    children = await children.filter((child) => child != remove);

    return t(ok, children);
}
async function terminateChildren(ctx, children, name) {
    const terminate = async (child) => {
        log(
            ctx,
            'terminateChildren(name: %o) : terminate(child.id: %o)',
            name,
            child.id
        );

        if (isTemporary(child)) {
            await doTerminate(ctx, child, name);
            return remove;
        } else {
            await doTerminate(ctx, child, name);
            return { ...child, pid: null };
        }
    };

    children = await children.map(terminate);
    children = await children.filter((item) => item != remove);

    return children;
}
async function doTerminate(ctx, child, name) {
    if (!Pid.isPid(child.pid)) return ok;

    log(ctx, '_doTerminate(child.id: %o)', child.id);
    const result = await _shutdown(ctx, child);
    const compare = matching.caseOf(result);

    log(ctx, '_doTerminate(child.id: %o, result: %o)', child.id, result);

    if (compare(ok)) {
        return ok;
    } else if (compare(t(error, _))) {
        const [, reason] = result;
        log(
            ctx,
            'doTerminate(child.id: %o, shutdown_error: %o)',
            child.id,
            reason
        );
    }

    return ok;
}
const _shutdown = matching.clauses(function _shutdown(route) {
    route({ shutdown: brutal_kill, [spread]: _ }).to(doBrutalKill);
    route({ shutdown: Number.isInteger, [spread]: _ }).to(doTimedKill);

    async function doBrutalKill(ctx, child) {
        log(
            ctx,
            'doBrutalKill(child.id: %o, child.pid: %o)',
            child.id,
            child.pid
        );
        const ref = await ctx.monitor(child.pid);
        log(ctx, 'doBrutalKill(child.id: %o, ref: %o)', child.id, ref);
        await ctx.exit(child.pid, kill);

        const [, , , pid, reason] = await ctx.receive(
            t(DOWN, ref, 'process', _, _)
        );
        log(
            ctx,
            'doBrutalKill(child.id: %o, pid: %o, reason: %o)',
            child.id,
            pid,
            reason
        );

        const finalReason = await unlinkFlush(ctx, pid, reason);
        return evaluateReason(child, finalReason);
    }
    async function doTimedKill(ctx, child) {
        log(ctx, 'doTimedKill(child.id: %o)', child.id);
        const ref = await ctx.monitor(child.pid);
        await ctx.exit(child.pid, shutdown);

        try {
            const [, , , pid, reason] = await ctx.receive(
                t(DOWN, ref, 'process', _, _),
                timeout
            );
            const finalReason = await unlinkFlush(ctx, pid, reason);
            return evaluateReason(child, finalReason);
        } catch (err) {
            await ctx.exit(child.pid, kill);
            const [, , , pid, reason] = await ctx.receive(
                t(DOWN, ref, 'process', _, _)
            );
            const finalReason = await unlinkFlush(ctx, pid, reason);
            return evaluateReason(child, finalReason);
        }
    }
    async function unlinkFlush(ctx, pid, defaultReason) {
        await ctx.unlink(pid);
        try {
            const [, , reason] = await ctx.receive(t(EXIT, pid, _), 0);
            return reason;
        } catch (err) {
            return defaultReason;
        }
    }
    async function evaluateReason(child, reason) {
        const childMatches = matching.caseOf(child);
        const reasonMatches = matching.caseOf(reason);
        const isPermanent = childMatches({ restart: permanent, [spread]: _ });

        if (reasonMatches(killed)) {
            return ok;
        } else if (reasonMatches(shutdown) && !isPermanent) {
            return ok;
        } else if (reasonMatches(t(shutdown, _)) && !isPermanent) {
            return ok;
        } else if (reasonMatches(normal) && !isPermanent) {
            return ok;
        } else {
            return t(error, reason);
        }
    }
});
function getSpecById(ctx, id, specs) {
    return specs.find((child) => child.id == id);
}
function updatePid(state, id, pid) {
    let { children } = state;
    let [before, after] = _splitChild(id, children);
    const child = car(after);
    after = cdr(after);
    children = before.append(cons({ ...child, pid }, after));
    return { ...state, children };
}
function doRestart(ctx, pid, reason, state) {
    log(ctx, 'doRestart(pid: %o, state.children: %o)', pid, state.children);

    let node = state.children;
    let index = 0;
    const matchesPid = core.compile({ pid, [spread]: _ });

    while (l.isList(node) && node !== l.nil && !matchesPid(car(node))) {
        node = cdr(node);
        index++;
    }

    log(ctx, 'doRestart(pid: %o, node: %o)', pid, node);

    if (node !== l.nil) {
        const child = car(node);
        const compare = core.caseOf(child.restart);
        if (compare(permanent) || (compare(transient) && reason !== normal)) {
            const compare = core.caseOf(state.strategy);
            log(
                ctx,
                'doRestart(%o, %o, %o) : restart',
                child.restart,
                state.strategy,
                reason
            );
            if (compare(isSimpleOneForOne)) {
                return doSimpleOneForOneRestart(ctx, state, child.id, pid);
            } else if (compare(isOneForOne)) {
                return doOneForOneRestart(ctx, state, child.id, pid);
            } else if (compare(isOneForAll)) {
                return doOneForAllRestart(ctx, state, child.id, pid);
            } else if (compare(isRestForOne)) {
                return doRestForOneRestart(ctx, state, child.id, pid);
            } else {
                throw new OTPError(t('bad_strategy', state.strategy));
            }
        } else {
            const compare = core.caseOf(state.strategy);
            log(
                ctx,
                'doRestart(%o, %o, %o) : ignore',
                child.restart,
                state.strategy,
                reason
            );
            if (compare(isSimpleOneForOne)) {
                const { children } = state;
                return t(ok, {
                    ...state,
                    children: children.deleteIndex(index),
                });
            } else {
                const { children } = state;
                return t(ok, {
                    ...state,
                    children: l(
                        ...children.slice(0, index),
                        { ...child, pid: null },
                        ...children.slice(index + 1)
                    ),
                });
            }
        }
    } else {
        return t(ok, state);
    }
}
function isTemporary(child) {
    const compare = matching.caseOf(child.restart);
    return compare(temporary);
}
function _restarting(pid) {
    if (Pid.isPid(pid)) {
        return RESTARTING(pid);
    } else {
        return pid;
    }
}
function _findChildById(id, children) {
    const withId = matching.compile({ id, [spread]: _ });
    return children.find(withId);
}
function _deleteChild(ctx, id, children) {
    let node = children;
    let stack = l.nil;

    log(ctx, '_deleteChild(id: %o, children: %o)', id, children);

    while (List.isList(node) && node != l.nil) {
        const child = car(node);

        log(
            ctx,
            '_deleteChild(id: %o, child.id: %o, isTemporary(child): %o)',
            id,
            child.id,
            isTemporary(child)
        );

        if (child.id != id) {
            stack = cons(child, stack);
        } else if (!isTemporary(child)) {
            stack = cons({ ...child, pid: null }, stack);
        }

        node = cdr(node);
    }

    return stack.reverse();
}
function _splitChild(id, children) {
    return children.split((child) => child.id == id);
}

const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);

    server.onCall(which_children, _whichChildren);
    server.onCall(count_children, _countChildren);
    server.onCall(t(start_child, _), _startChild);
    server.onCall(_, _handleCall);

    server.onCast(_, _handleCast);

    server.onInfo(t(EXIT, Pid.isPid, _, _), _handleEXIT);
    server.onInfo(t(EXIT, Pid.isPid, _), _handleEXIT);
    server.onInfo(start_children, _startChildren);
    server.onInfo(_, _handleInfo);
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
export async function restartChild() {
    return gen_server.call(ctx, pid, t(restart_child, pid));
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
