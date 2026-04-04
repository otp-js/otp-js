import { ok } from '@otpjs/core/symbols';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { cons, l, Pid, t } from '@otpjs/types';
import {
    startChild as doStartChild,
    handleStartResult,
    updatePid,
} from './common.js';
export { simple_one_for_one as name } from '#symbols';

const { _, spread } = matching.Symbols;
const { noreply } = gen_server.Symbols;
const { kase } = matching;

export async function restart(ctx, state, id, pid) {
    const child = state.children.find((child) => child.id === id);
    const { args } = child;

    const base = state.childSpecs.nth(0);
    const spec = { ...base, start: t(base.start[0], args) };
    const [, newSpec] = await doStartChild(ctx, spec);

    return t(ok, newSpec.pid, updatePid(state, id, newSpec.pid));
}
export function cleanup(ctx, state, index) {
    const { children } = state;
    return t(ok, {
        ...state,
        children: children.deleteIndex(index),
    });
}
export function startChildren(_ctx, state) {
    return t(ok, l.nil);
}
export async function startChild(ctx, specOrArgs, state) {
    const [base] = state.childSpecs;
    const [start, args] = base.start;
    const result = await doStartChild(ctx, {
        ...base,
        start: t(start, l(...args, ...specOrArgs)),
        restart: base.restart,
    });

    return kase(result).of((matches) => {
        matches(t(ok, { pid: Pid.isPid, [spread]: _ })).then(([, child]) => {
            const { pid } = child;
            const id = pid.toString();
            const nextState = {
                ...state,
                children: cons({ ...child, id }, state.children),
            };
            return handleStartResult(t(ok, pid, nextState), nextState);
        });
        matches(t(ok, { pid: null, [spread]: _ })).then(() =>
            handleStartResult(t(ok, undefined, state), state)
        );
        matches(t(ok, undefined)).then(() =>
            handleStartResult(t(ok, undefined, state), state)
        );
    });
}
