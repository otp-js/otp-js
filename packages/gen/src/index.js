import * as otp from '@otpjs/core';
import * as match from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };

const { monitor, link, nolink, $gen_call, $gen_cast, already_started } =
    Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('gen')(...args);
}

const { ok, error, nodedown, DOWN } = otp.Symbols;
const { _ } = match.Symbols;

const DEFAULT_TIMEOUT = 5000;

const isLocalName = match.compile(t('local', _));
const isUndefined = match.compile(undefined);
const isPid = Pid.isPid;

function where(ctx, name) {
    if (isLocalName(name)) {
        const localName = getName(name);
        log(ctx, 'where(name: %o, localName: %o)', name, localName);
        return ctx.whereis(localName);
    } else {
        log(ctx, 'where(name: %o, notLocal)', name);
        return undefined;
    }
}

export async function start(ctx, linking, name, init_it, options = {}) {
    const response = where(ctx, name);
    switch (true) {
        case isUndefined(response):
            return doSpawn(ctx, linking, name, init_it, options);
        default:
        case isPid(response):
            return t(error, t(already_started, response));
    }
}
const doSpawn = match.clauses(function routeSpawn(route) {
    route(link, _, _, _).to(doSpawnLink);
    route(link, _, _, _, _).to(doSpawnLink);
    route(monitor, _, _, _).to(doSpawnMonitor);
    route(monitor, _, _, _, _).to(doSpawnMonitor);
    route(nolink, _, _, _).to(doSpawnNoLink);
    route(nolink, _, _, _, _).to(doSpawnNoLink);
    route(_, _, _, _).to(doSpawnNoLink);
    route(_, _, _, _, _).to(doSpawnNoLink);

    async function doSpawnLink(ctx, linking, name, init_it, options) {
        const timeout = 'timeout' in options ? options.timeout : Infinity;
        log(ctx, 'doSpawn() : proc_lib.startLink()');
        return await proc_lib.startLink(
            ctx,
            initializer(name, init_it, options),
            timeout
        );
    }
    /* istanbul ignore next */
    function doSpawnMonitor(ctx, linking, name, init_it, options) {
        log(ctx, 'doSpawn() : proc_lib.startMonitor()');
        throw new OTPError(t('not_yet_implemented', link));
    }
    function doSpawnNoLink(ctx, linking, name, init_it, options) {
        const timeout = 'timeout' in options ? options.timeout : Infinity;
        log(ctx, 'doSpawn() : proc_lib.start()');
        return proc_lib.start(
            ctx,
            initializer(name, init_it, options),
            timeout
        );
    }
});

function initializer(name, initIt, options) {
    const decision = match.buildCase((is) => {
        is(true, success);
        is(t(false, Pid.isPid), alreadyStarted);
    });

    return async function initialize(ctx, starter) {
        const registration = registerName(ctx, name);
        const next = decision.for(registration);
        return next(ctx, registration, initIt, starter);
    };

    function success(ctx, _result, initIt, starter) {
        log(ctx, 'initialize() : initIt(%o)', starter);
        return initIt(ctx, starter);
    }

    function alreadyStarted(ctx, [, pid], _initIt, starter) {
        return proc_lib.initAck(
            ctx,
            starter,
            t(error, t(already_started, pid))
        );
    }
}

export const registerName = match.clauses(function routeRegisterName(route) {
    route(isLocalName).to(registerLocalName);
    route(_).to(() => true);
    function registerLocalName(ctx, name) {
        try {
            ctx.register(getName(name));
            return true;
        } catch (err) {
            const pid = where(ctx, name);
            log(
                ctx,
                'registerName(name: %o, error: %o, pid: %o)',
                name,
                err,
                pid
            );
            return t(false, pid);
        }
    }
});

export const unregisterName = match.clauses((route) => {
    route(isLocalName).to(unregisterLocal);
    route(Pid.isPid).to(doNothing);

    function unregisterLocal(ctx, [, name]) {
        try {
            ctx.unregister(name);
        } finally {
            return ok;
        }
    }

    function doNothing() {
        return ok;
    }
});
const getName = match.clauses(function routeGetName(route) {
    route(t('local', _)).to(([, name]) => name);
    route(Pid.isPid).to((pid) => pid);
});

const callReplyPattern = (ref) => match.compile(t(ref, _));
const downPattern = (mref, pid) => match.compile(t(DOWN, mref, _, pid, _));
export const call = match.clauses(function routeCall(route) {
    route(Pid.isPid, _).to(doCall);
    route(Pid.isPid, _, _).to(doCall);
    route(_, _).to(doRemoteCall);
    route(_, _, _).to(doRemoteCall);
});
function doRemoteCall(ctx, pid, message, timeout = DEFAULT_TIMEOUT) {
    const fun = (pid) => doCall(ctx, pid, message, timeout);
    log(ctx, 'call(%o) : isNotPid', pid);
    return doForProcess(ctx, pid, fun);
}
async function doCall(ctx, pid, message, timeout) {
    const self = ctx.self();
    const ref = ctx.ref();

    try {
        const mref = ctx.monitor(pid);
        const isReply = callReplyPattern(ref);
        const isDown = downPattern(mref, pid);

        ctx.send(pid, t($gen_call, t(self, ref), message));
        log(ctx, 'doCall(%o, %o) : receive(%o, %o)', pid, ref, isReply, isDown);
        const ret = await ctx.receive(match.oneOf(isDown, isReply), timeout);

        log(ctx, 'doCall(%o, %o) : ret : %o', pid, ref, ret);

        switch (true) {
            case isReply(ret): {
                const [ref, response] = ret;
                ctx.demonitor(mref);
                log(ctx, 'doCall(%o, %o) : response : %o', pid, ref, response);
                return response;
            }
            case isDown(ret): {
                const [_DOWN, ref, _type, pid, reason] = ret;
                log(
                    ctx,
                    'doCall(%o, %o) : throw OTPError(%o)',
                    pid,
                    ref,
                    reason
                );
                throw new OTPError(reason);
            }
        }
    } catch (err) {
        log(ctx, 'doCall(%o, %o, %o) : error : %o', pid, ref, timeout, err);
        throw err;
    }
}

export const cast = match.clauses(function routeCast(route) {
    route(Pid.isPid, _).to(doCast);
    route(_, _).to(doRemoteCast);
    function doCast(ctx, pid, message) {
        return ctx.send(pid, t($gen_cast, message));
    }
    function doRemoteCast(ctx, pid, message) {
        const fun = (pid) => doCast(ctx, pid, message);
        return doForProcess(ctx, pid, fun);
    }
});

const isKeyedSymbol = (v) =>
    typeof v === 'symbol' && Symbol.keyFor(v) !== undefined;
function doForProcess(ctx, process, fun) {
    // TODO: look up process (which is not a Pid)
    // As of the time of this comment, core/node handles routing remote messages
    const compare = match.caseOf(process);

    if (compare(isKeyedSymbol)) {
        const result = ctx.whereis(process);
        log(ctx, 'doForProcess(%o) : found : %o', process, result);
        if (result === undefined) {
            throw OTPError('noproc');
        } else {
            log(ctx, 'fun(%o)', result);
            return fun(result);
        }
    } else if (compare(t(_, _))) {
        const [name, node] = process;
        if (ctx.nodes().includes(node)) {
            return fun(process);
        } else {
            throw OTPError(t(nodedown, node));
        }
    } else {
        const error = new OTPError('not_implemented');

        log(ctx, 'doForProcess(%o) : not_found', process);
        log(ctx, 'doForProcess(%o) : error : %o', error);

        throw error;
    }
}

export function reply(ctx, [pid, ref], reply) {
    log(ctx, 'ctx.send(%o, %o)', pid, t(ref, reply));
    ctx.send(pid, t(ref, reply));
}
