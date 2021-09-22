import debug from 'debug';
import * as core from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as Symbols from './symbols.js';
import { OTPError } from '@otpjs/core/lib/error';

export { Symbols };

function log(ctx, ...args) {
    return ctx.log.extend('supervisor')(...args);
}

const { ok, _, spread, trap_exit, EXIT, error, normal } = core.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const { Pid, Ref } = core;
const { which_children, count_children, temporary, transient, permanent } = Symbols;

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

    if (compare([ok, _])) {
        const [, [options, childSpecs]] = response;
        ctx.send(ctx.self(), start_children);
        return [ok, { callbacks, ...options, childSpecs }]
    } else if (compare([stop, _])) {
        return response;
    } else {
        return [stop, 'bad_init'];
    }
}

async function doStartChild(ctx, spec, retries) {
    const { id, restart } = spec;
    const [start, args] = spec.start;

    log(ctx, 'doStartChild(%o) : start : %o', spec.id, start);

    const response = await start(ctx, ...args)
    const compare = core.caseOf(response)

    log(ctx, 'doStartChild(%o) : response : %o', spec.id, response);
    if (compare([ok, Pid.isPid])) {
        const [, pid] = response;
        return { id, pid, args, restart };
    } else if (compare([error, _])) {
        const [, reason] = response;

        log(ctx, 'doStartChild(%o) : error : %o', spec.id, reason);

        if (restart === temporary) {
            return null;
        } else if (
            restart === permanent
            || reason !== normal
        ) {
            log(ctx, 'doStartChild(%o) : retry : %o', spec.id, retries + 1);
            return doStartChild(ctx, spec, retries + 1);
        } else {
            return null;
        }
    } else {
        throw new OTPError(['cannot_start', spec.id, response]);
    }
}

function handleCall(ctx, call, from, state) {
    const itMatches = core.caseOf(call);

    log(ctx, 'handleCall(%o)', call);
    if (itMatches(which_children)) {
        return [
            reply,
            [
                ok,
                state.children.map(
                    ({ pid, id }) => ({ pid, id })
                ),
            ],
            state
        ];
    } else if (itMatches(count_children)) {
        return [reply, state.children.length, state];
    } else if (itMatches([start_child, _])) {
        const [, specOrArgs] = call;
        return _startChild(ctx, specOrArgs, state);
    } else {
        log(ctx, 'handleCall(%o) : unhandled', call);
        return [noreply, state];
    }
}

const exitPattern = core.compile([EXIT, Pid.isPid, _, _]);
async function handleInfo(ctx, info, state) {
    const compare = core.caseOf(info);

    log(ctx, 'handleInfo(%o)', info);

    if (compare(exitPattern)) {
        const [, pid, reason, _stack] = info;
        const nextState = await doRestart(ctx, pid, reason, state);
        return [noreply, nextState];
    } else if (compare(start_children)) {
        const { strategy, childSpecs } = state;
        const compare = core.caseOf(strategy);

        if (compare(Symbols.simple_one_for_one)) {
            return [noreply, { ...state, children: [] }]
        } else {
            const children = await _startChildren(ctx, childSpecs);
            return [noreply, { ...state, children }];
        }
    } else {
        return [noreply, state];
    }
}

async function _startChildren(ctx, specs) {
    let responses = [];
    for (let spec of specs) {
        try {
            const response = await doStartChild(ctx, spec);
            if (response) {
                responses.push(response);
            }
        } catch (err) {
            responses.push({
                id: spec.id,
                pid: null
            })
        }
    }
    return responses;
}

async function _startChild(ctx, specOrArgs, state) {
    const compare = core.caseOf(state.strategy);

    log(ctx, '_startChild(%o, %o)', state.strategy, specOrArgs);

    if (compare(isSimpleOneForOne)) {
        log(ctx, '_startChild(simple_one_for_one, %o) : state : %o', specOrArgs, state);
        const [base] = state.childSpecs;
        const [start, args] = base.start;
        log(ctx, '_startChild(simple_one_for_one, %o) : doStartChild()', specOrArgs);
        const result = await doStartChild(
            ctx,
            {
                ...base,
                start: [start, [...args, ...specOrArgs]],
                restart: base.restart,
            }
        );
        log(ctx, '_startChild(simple_one_for_one, %o) : result : %o', specOrArgs, result);

        const compare = core.caseOf(result);
        if (compare({ pid: Pid.isPid, [spread]: _ })) {
            const { pid } = result;
            const nextState = {
                ...state,
                children: [
                    ...state.children,
                    result,
                ]
            }
            return _handleStartResult(
                [ok, pid, nextState],
                nextState
            )
        } else {
            return _handleStartResult(
                result,
                state
            );
        }
    } else {
        log(ctx, '_startChild(simple_one_for_one, %o) : doStartChild()', specOrArgs);
        const result = await doStartChild(
            ctx,
            specOrArgs
        );
        const index = state.children.findIndex(({ id }) => id === specOrArgs.id);
        let children = state.children;
        if (index >= 0) {
            children = [
                ...children.slice(0, index),
                result,
                ...children.slice(index + 1, children.length)
            ];

        } else {
            children = [
                ...children,
                result
            ];
        }
        const nextState = {
            ...state,
            children
        }
        return _handleStartResult(
            [ok, result.pid, nextState],
            state
        )
    }
}

async function _handleStartResult(result, state) {
    const compare = core.caseOf(result);
    if (compare([ok, _, _])) {
        const [, pid, nextState] = result;
        return [reply, [ok, pid], nextState];
    } else if (compare([error, normal])) {
        return [reply, [error, normal], state];
    } else if (compare([error, _])) {
        const [, reason] = result;
        return [stop, reason];
    } else {
        return [stop, ['unrecognized_response', result]];
    }
}

const isSimpleOneForOne = core.compile(Symbols.simple_one_for_one);
const isOneForOne = core.compile(Symbols.one_for_one);
const isOneForAll = core.compile(Symbols.one_for_all);
const isRestForOne = core.compile(Symbols.rest_for_one);
function doRestart(ctx, pid, reason, state) {
    log(ctx, 'findChildById(%o, %o)', pid, state.children);
    const id = state.children.findIndex(
        core.compile({ pid, [spread]: _ })
    );
    const child = state.children[id];

    const compare = core.caseOf(child.restart);

    if (
        compare(permanent)
        || (
            compare(transient)
            && reason !== normal
        )
    ) {
        const compare = core.caseOf(state.strategy);
        log(ctx, 'doRestart(%o, %o, %o) : restart', child.restart, state.strategy, reason)
        if (compare(isSimpleOneForOne)) {
            return doSimpleOneForOneRestart(ctx, state, id, pid);
        } else if (compare(isOneForOne)) {
            return doOneForOneRestart(ctx, state, id, pid);
        } else if (compare(isOneForAll)) {
            throw new OTPError('strategy_not_implemented');
        } else if (compare(isRestForOne)) {
            throw new OTPError('strategy_not_implemented');
        } else {
            throw new OTPError(['bad_strategy', state.strategy]);
        }
    } else {
        const compare = core.caseOf(state.strategy);
        log(ctx, 'doRestart(%o, %o, %o) : ignore', child.restart, state.strategy, reason)
        if (compare(isSimpleOneForOne)) {
            const { children } = state;
            return {
                ...state,
                children: [
                    ...children.slice(0, id),
                    ...children.slice(id + 1)
                ]
            }
        } else {
            const { children } = state;
            return {
                ...state,
                children: [
                    ...children.slice(0, id),
                    { ...child, pid: null },
                    ...children.slice(id + 1)
                ]
            }
        }
    }
}

async function doSimpleOneForOneRestart(ctx, state, id, pid) {
    const child = state.children[id];
    const { args } = child;

    const base = state.childSpecs[0];
    const spec = { ...base, start: [base.start[0], args] };
    const newSpec = await doStartChild(ctx, spec)

    return updatePid(state, id, newSpec.pid);
}

async function doOneForOneRestart(ctx, state, id, pid) {
    const newSpec = await doStartChild(ctx, getSpecById(ctx, id, state.childSpecs));
    return updatePid(state, id, newSpec.pid);
}

function getSpecById(ctx, id, specs) {
    log(ctx, 'getSpecsById(%o, %o)', id, specs);
    return specs[id];
}

function updatePid(state, id, pid) {
    state.children[id].pid = pid;
    return state;
}

const callbacks = {
    init,
    handleCall,
    handleInfo
};

export async function startLink(ctx, name, supCallbacks, args = []) {
    if (!Array.isArray(name) && name !== undefined) {
        args = supCallbacks || args;
        supCallbacks = name;
        name = undefined;
    }
    return gen_server.startLink(ctx, name, callbacks, [supCallbacks, args]);
}

export async function startChild(ctx, pid, args) {
    return gen_server.call(ctx, pid, [start_child, args]);
}

export async function restartChild() {
    return gen_server.call(ctx, pid, [restart_child, pid]);
}

export async function deleteChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, [delete_child, target]);
}

export async function terminateChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, [terminate_child, target]);
}

export async function whichChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, which_children, timeout);
}

export async function countChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, count_children, timeout);
}
