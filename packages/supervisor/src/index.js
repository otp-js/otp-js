import * as core from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { Pid, t, l, cons } from '@otpjs/types';
import * as Symbols from './symbols.js';
import { OTPError } from '@otpjs/types';

export { Symbols };

function log(ctx, ...args) {
    return ctx.log.extend('supervisor')(...args);
}

const { ok, trap_exit, EXIT, error, normal } = core.Symbols;
const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const { which_children, count_children, temporary, transient, permanent } =
    Symbols;

const start_children = Symbol.for('start_children');
const start_child = Symbol.for('start_child');
const restart_child = Symbol.for('restart_child');

const MAX_RETRIES = 10;

async function init(ctx, callbacks, args) {
    ctx.processFlag(trap_exit, true);

    log(ctx, 'init()');

    const response = await callbacks.init(ctx, ...args);
    const compare = core.caseOf(response);

    log(ctx, 'init() : response : %o', response);

    if (compare(t(ok, _))) {
        const [, [options, childSpecs]] = response;
        ctx.send(ctx.self(), start_children);
        return t(ok, { callbacks, ...options, childSpecs });
    } else if (compare(t(stop, _))) {
        return response;
    } else {
        return t(stop, 'bad_init');
    }
}

async function doStartChild(ctx, spec, retries) {
    const { id, restart } = spec;
    const [start, args] = spec.start;

    log(ctx, 'doStartChild(%o) : start : %o', spec.id, start);

    const response = await start(ctx, ...args);
    const compare = core.caseOf(response);

    log(ctx, 'doStartChild(%o) : response : %o', spec.id, response);
    if (compare(t(ok, Pid.isPid))) {
        const [, pid] = response;
        return { id, pid, args, restart };
    } else if (compare(t(error, _))) {
        const [, reason] = response;

        log(ctx, 'doStartChild(%o) : error : %o', spec.id, reason);

        if (restart === temporary) {
            return null;
        } else if (restart === permanent || reason !== normal) {
            log(ctx, 'doStartChild(%o) : retry : %o', spec.id, retries + 1);
            return doStartChild(ctx, spec, retries + 1);
        } else {
            return null;
        }
    } else {
        throw new OTPError(t('cannot_start', spec.id, response));
    }
}

function handleCall(ctx, call, from, state) {
    const itMatches = core.caseOf(call);

    log(ctx, 'handleCall(%o)', call);
    if (itMatches(which_children)) {
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
    } else if (itMatches(count_children)) {
        return t(reply, state.children.length(), state);
    } else if (itMatches(t(start_child, _))) {
        const [, specOrArgs] = call;
        return _startChild(ctx, specOrArgs, state);
    } else {
        log(ctx, 'handleCall(%o) : unhandled', call);
        return t(noreply, state);
    }
}

const exitPattern = core.compile(t(EXIT, Pid.isPid, _, _));
async function handleInfo(ctx, info, state) {
    const compare = core.caseOf(info);

    log(ctx, 'handleInfo(%o)', info);

    if (compare(exitPattern)) {
        const [, pid, reason, _stack] = info;
        const nextState = await doRestart(ctx, pid, reason, state);
        return t(noreply, nextState);
    } else if (compare(start_children)) {
        const { strategy, childSpecs } = state;
        const compare = core.caseOf(strategy);

        if (compare(Symbols.simple_one_for_one)) {
            return t(noreply, { ...state, children: l() });
        } else {
            const children = await _startChildren(ctx, childSpecs);
            return t(noreply, { ...state, children });
        }
    } else {
        return t(noreply, state);
    }
}

async function _startChildren(ctx, specs) {
    let responses = l();
    for (let spec of specs) {
        try {
            const response = await doStartChild(ctx, spec);
            if (response) {
                responses = cons(response, responses);
            }
        } catch (err) {
            responses = cons({ id: spec.id, pid: null }, responses);
        }
    }
    return responses.reverse();
}

async function _startChild(ctx, specOrArgs, state) {
    const compare = core.caseOf(state.strategy);

    log(ctx, '_startChild(%o, %o)', state.strategy, specOrArgs);

    if (compare(isSimpleOneForOne)) {
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
        const result = await doStartChild(ctx, {
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
        if (compare({ pid: Pid.isPid, [spread]: _ })) {
            const { pid } = result;
            const nextState = {
                ...state,
                children: cons(result, state.children),
            };
            return _handleStartResult(t(ok, pid, nextState), nextState);
        } else {
            return _handleStartResult(result, state);
        }
    } else {
        log(
            ctx,
            '_startChild(simple_one_for_one, %o) : doStartChild()',
            specOrArgs
        );
        const result = await doStartChild(ctx, specOrArgs);
        const nextChildren = state.children.replaceWhere(
            ({ id }) => id === specOrArgs.id,
            result,
            true
        );
        const nextState = {
            ...state,
            children: nextChildren,
        };
        return _handleStartResult(t(ok, result.pid, nextState), state);
    }
}

async function _handleStartResult(result, state) {
    const compare = core.caseOf(result);
    if (compare(t(ok, _, _))) {
        const [, pid, nextState] = result;
        return t(reply, t(ok, pid), nextState);
    } else if (compare(t(error, normal))) {
        return t(reply, t(error, normal), state);
    } else if (compare(t(error, _))) {
        const [, reason] = result;
        return t(stop, reason);
    } else {
        return t(stop, t('unrecognized_response', result));
    }
}

const isSimpleOneForOne = core.compile(Symbols.simple_one_for_one);
const isOneForOne = core.compile(Symbols.one_for_one);
const isOneForAll = core.compile(Symbols.one_for_all);
const isRestForOne = core.compile(Symbols.rest_for_one);
function doRestart(ctx, pid, reason, state) {
    log(ctx, 'findChildById(%o, %o)', pid, state.children);

    let id = 0;
    let node = state.children;
    const matchesPid = core.compile({ pid, [spread]: _ });

    while (l.isList(node) && node != l.nil && !matchesPid(node.head)) {
        node = node.tail;
        id++;
    }

    const child = node.head;
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
            return doSimpleOneForOneRestart(ctx, state, id, pid);
        } else if (compare(isOneForOne)) {
            return doOneForOneRestart(ctx, state, id, pid);
        } else if (compare(isOneForAll)) {
            throw new OTPError('strategy_not_implemented');
        } else if (compare(isRestForOne)) {
            throw new OTPError('strategy_not_implemented');
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
            return {
                ...state,
                children: children.deleteIndex(id),
            };
        } else {
            const { children } = state;
            return {
                ...state,
                children: l(
                    ...children.slice(0, id),
                    { ...child, pid: null },
                    ...children.slice(id + 1)
                ),
            };
        }
    }
}

async function doSimpleOneForOneRestart(ctx, state, id, pid) {
    const child = state.children[id];
    const { args } = child;

    const base = state.childSpecs[0];
    const spec = { ...base, start: t(base.start.get(0), args) };
    const newSpec = await doStartChild(ctx, spec);

    return updatePid(state, id, newSpec.pid);
}

async function doOneForOneRestart(ctx, state, id, pid) {
    const newSpec = await doStartChild(
        ctx,
        getSpecById(ctx, id, state.childSpecs)
    );
    return updatePid(state, id, newSpec.pid);
}

function getSpecById(ctx, id, specs) {
    log(ctx, 'getSpecsById(%o, %o)', id, specs);
    return specs.nth(id);
}

function updatePid(state, id, pid) {
    state.children.nth(id).pid = pid;
    return state;
}

const callbacks = {
    init,
    handleCall,
    handleInfo,
};

export async function startLink(ctx, name, supCallbacks, args = l()) {
    if (!t.isTuple(name) && name !== undefined) {
        args = supCallbacks || args;
        supCallbacks = name;
        name = undefined;
    }
    ctx.log('startLink(name: %o, args: %o)', name, args);
    return gen_server.startLink(ctx, name, callbacks, l(supCallbacks, args));
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
