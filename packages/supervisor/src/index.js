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
const { which_children, count_children } = Symbols;

const MAX_RETRIES = 10;

async function init(ctx, callbacks, args) {
    ctx.processFlag(trap_exit, true);

    log(ctx, 'init()');

    const response = await callbacks.init(ctx, ...args);
    const compare = core.caseOf(response);

    log(ctx, 'init() : response : %o', response);

    if (compare([ok, _])) {
        const [, [options, childSpecs]] = response;
        ctx.send(ctx.self(), 'start');
        return [ok, { callbacks, ...options, childSpecs }]
    } else if (compare([stop, _])) {
        return response;
    } else {
        return [stop, 'bad_init'];
    }
}

async function doStartChild(ctx, spec, retries) {
    const { id } = spec;
    const [start, args] = spec.start;

    log(ctx, 'doStartChild(%o) : start : %o', spec, start);

    const response = await start(ctx, ...args)
    const compare = core.caseOf(response)

    log(ctx, 'doStartChild(%o) : response : %o', spec.id, response);
    if (compare([ok, Pid.isPid])) {
        const [, pid] = response;
        return { id, pid };
    } else if (retries < MAX_RETRIES) {
        log(ctx, 'doStartChild(%o) : retry : %o', retries + 1);
        return doStartChild(ctx, spec, retries + 1);
    } else {
        throw new OTPError(['cannot_start', spec.id, response]);
    }
}

function handleCall(ctx, call, from, state) {
    const compare = core.caseOf(call);

    log(ctx, 'handleCall(%o)', call);
    if (compare(which_children)) {
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
    } else if (compare(count_children)) {
        return [reply, state.children.length, state];
    } else if (compare(['start_child', _])) {
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
        const [EXIT, pid, reason, _stack] = info;
        if (reason != normal) {
            const nextState = await doRestart(ctx, pid, state);
            return [noreply, nextState];
        } else {
            return [noreply, state];
        }
    } else if (compare('start')) {
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
            responses.push(response);
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
                start: [start, [...args, ...specOrArgs]]
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
function doRestart(ctx, pid, state) {
    log(ctx, 'findChildById(%o, %o)', pid, state.children);
    const id = state.children.findIndex(
        core.compile({ pid, [spread]: _ })
    );

    const compare = core.caseOf(state.strategy);

    if (compare(isSimpleOneForOne)) {
        return doOneForOneRestart(ctx, state, id, pid);
    } else if (compare(isOneForOne)) {
        return doOneForOneRestart(ctx, state, id, pid);
    } else if (compare(isOneForOne)) {
        throw new OTPError('strategy_not_implemented');
    } else if (compare(isOneForOne)) {
        throw new OTPError('strategy_not_implemented');
    } else {
        throw new OTPError(['bad_strategy', state.strategy]);
    }
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
    if (typeof name === 'object') {
        args = supCallbacks || args;
        supCallbacks = name;
        name = undefined;
    }
    return gen_server.startLink(ctx, name, callbacks, [supCallbacks, args]);
}

export function startChild(ctx, pid, args) {
    return gen_server.call(ctx, pid, ['start_child', args]);
}

export function restartChild() {
    return gen_server.call(ctx, pid, ['restart_child', pid]);
}

export function deleteChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, ['delete_child', target]);
}

export function terminateChild(ctx, pid, target) {
    return gen_server.call(ctx, pid, ['terminate_child', target]);
}

export function whichChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, which_children, timeout);
}

export async function countChildren(ctx, pid, timeout = Infinity) {
    return gen_server.call(ctx, pid, count_children, timeout);
}
