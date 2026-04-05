import debug from 'debug';
import {
    brutal_kill,
    cannot_start,
    failed_to_start_child,
    ignore,
    max_retries,
    permanent,
    remove,
    restarting,
    shutdown,
    temporary,
    unrecognized_response,
} from '#symbols';
import {
    DOWN,
    error,
    EXIT,
    kill,
    killed,
    normal,
    ok,
} from '@otpjs/core/symbols';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { car, cdr, cons, l, OTPError, Pid, t } from '@otpjs/types';

const _log = debug('otpjs:supervisor:strategy:common');

function log(ctx, ...formatters) {
    if (typeof ctx === 'string') {
        _log(ctx, ...formatters);
    } else {
        ctx.log.extend('supervisor:strategy:common')(...formatters);
    }
}

const MAX_RETRIES = 10;

const { _, spread } = matching.Symbols;
const { noreply, reply } = gen_server.Symbols;
const { kase } = matching;

export const isTemporary = matching.compile({
    restart: temporary,
    [spread]: _,
});
export async function startChildren(ctx, children) {
    const start = async (child) => {
        const response = await startChild(ctx, child);
        return kase(response).of((matches) => {
            matches(t(ok, undefined))
                .when(() => isTemporary(child))
                .then(() => remove);
            matches(t(ok, _)).then(([, { pid }]) => ({ ...child, pid }));
            matches(t(ok, _, _)).then(([, { pid }]) => ({ ...child, pid }));
            matches(t(error, _)).then(([, reason]) => {
                if (reason instanceof OTPError) {
                    throw OTPError(
                        t(failed_to_start_child, child.id, reason.term)
                    );
                } else {
                    throw OTPError(t(failed_to_start_child, child.id, reason));
                }
            });
        });
    };

    children = await children.map(start);
    children = await children.filter((child) => child != remove);

    return t(ok, children);
}

export async function startChild(ctx, spec, retries = 0) {
    if (retries >= MAX_RETRIES) {
        throw OTPError(t(cannot_start, spec.id, max_retries));
    }

    try {
        const { id, restart } = spec;
        const [start, args] = spec.start;

        const response = await start(ctx, ...args);
        return matching.kase(response).of((match) => {
            match(t(ok, Pid.isPid)).then(([, pid]) => {
                return t(ok, { ...spec, args, pid });
            });
            match(ignore).then(() => {
                if (restart === temporary) {
                    return t(ok, undefined);
                } else {
                    return t(ok, { ...spec, pid: null });
                }
            });
            match(t(error, _)).then(([, reason]) => {
                if (restart === temporary) {
                    return response;
                } else if (restart === permanent || reason !== normal) {
                    return startChild(ctx, spec, retries + 1);
                }
            });
            match(_).then(() => {
                throw new OTPError(t(cannot_start, spec.id, response));
            });
        });
    } catch (err) {
        return t(error, err);
    }
}

export async function standardStartChild(ctx, specOrArgs, state) {
    const result = await startChild(ctx, specOrArgs);
    return kase(result).of((matches) => {
        matches(t(ok, _)).then(() => {
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
            return handleStartResult(t(ok, child.pid, nextState), state);
        });
        matches(_).then(() => {
            return handleStartResult(result, state);
        });
    });
}

export function cleanup(ctx, state, index) {
    const { children } = state;
    let [before, after] = splitChildIndex(index, children);
    const child = car(after);
    after = cdr(after);
    return t(ok, {
        ...state,
        children: l(...before, { ...child, pid: null }, ...after),
    });
}

export async function handleStartResult(result, state) {
    return kase(result).of((matches) => {
        matches(t(ok, _, _)).then(([, response, nextState]) =>
            t(reply, t(ok, response), nextState)
        );
        matches(t(error, normal)).then(() => t(reply, t(error, normal), state));
        matches(t(error, _)).then(() => t(reply, result, state));
        matches(_).then(() => t(stop, t(unrecognized_response, result), state));
    });
}

function RESTARTING(pid) {
    return t(restarting, pid);
}
function _restarting(pid) {
    if (Pid.isPid(pid)) {
        return RESTARTING(pid);
    } else {
        return pid;
    }
}
export async function restartMultipleChildren(ctx, child, children, name) {
    children = await terminateChildren(ctx, children, name);
    const result = await startChildren(ctx, children, name);

    return kase(result).of((matches) => {
        matches(t(ok, _)).then((result) => result);
        matches(t(error, t(failed_to_start_child, _, _))).then(
            ([, children, [, failedId]]) => {
                const newPid =
                    failedId != child.id
                        ? _restarting(child.pid)
                        : RESTARTING(undefined);
                return t(
                    t(try_again, failed_id),
                    setPid(newPid, failedId, children)
                );
            }
        );
    });
}

async function terminateChildren(ctx, children, name) {
    const terminate = async (child) => {
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

export function splitChild(id, children) {
    return children.split((child) => child.id == id);
}
export function splitChildIndex(index, children) {
    return children.split((_child, childIndex) => index === childIndex);
}

export function updatePid(state, id, pid) {
    let { children } = state;
    log('updatePid(id: %o, pid: %o)', id, pid);
    let [before, after] = splitChild(id, children);
    log('updatePid(before: %o, after: %o)', before, after);
    const child = car(after);
    after = cdr(after);
    children = before.append(cons({ ...child, pid }, after));
    log('updatePid(updatedChildren: %o)', children);
    return { ...state, children };
}
