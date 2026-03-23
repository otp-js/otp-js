import debug from 'debug';
import * as otp from '@otpjs/core';
import { ok, error, nodedown, DOWN } from '@otpjs/core/symbols';
import { clauses, kase } from '@otpjs/matching';
import { _ } from '@otpjs/matching/symbols';
import { OTPError, Pid, t, l } from '@otpjs/types';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols.js';

export { Symbols };

const { monitor, link, nolink, $gen_call, $gen_cast, already_started } =
    Symbols;

const _log = debug('otpjs:gen');
const loggers = new WeakMap();
function log(ctx, ...args) {
    try {
        if (!loggers.has(ctx)) {
            loggers.set(ctx, ctx.log.extend('gen'));
        }
        return loggers.get(ctx)(...args);
    } catch (err) /* istanbul ignore next */ {
        _log('log(error: %o, ctx: %o): %s', err, ctx, err.stack);
        _log(...args);
    }
}

const DEFAULT_TIMEOUT = 5000;

function where(ctx, name) {
    return kase(name).of((match) => {
        match(t('local', _)).then((name) => {
            const localName = getName(name);
            log(ctx, 'where(name: %o, localName: %o)', name, localName);
            return ctx.whereis(localName);
        });
        match(_).then((name) => {
            log(ctx, 'where(name: %o, notLocal)', name);
            return undefined;
        });
    });
}

export async function start(ctx, linking, name, init_it, options = {}) {
    return kase(where(ctx, name)).of((match) => {
        match(undefined).then(() =>
            doSpawn(ctx, linking, name, init_it, options)
        );
        match(_).then((pid) => t(error, t(already_started, pid)));
    });
}
const doSpawn = clauses(function routeSpawn(route) {
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
        // TODO: implement spawn_monitor
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
    return async function initialize(ctx, starter) {
        return kase(registerName(ctx, name)).of((match) => {
            match(true).then(function success() {
                log(ctx, 'initialize() : initIt(%o)', starter);
                return initIt(ctx, starter);
            });
            match(t(false, Pid.isPid)).then(function alreadyStarted([, pid]) {
                return proc_lib.initAck(
                    ctx,
                    starter,
                    t(error, t(already_started, pid))
                );
            });
        });
    };
}

export const registerName = clauses(function routeRegisterName(route) {
    route(t('local', _)).to(registerLocalName);
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
                err.message,
                pid
            );
            return t(false, pid);
        }
    }
});

export const unregisterName = clauses((route) => {
    route(t('local', _)).to(unregisterLocal);
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
const getName = clauses(function routeGetName(route) {
    route(t('local', _)).to(([, name]) => name);
    route(Pid.isPid).to((pid) => pid);
});

export const call = clauses(function routeCall(route) {
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
async function doCall(ctx, pid, message, timeout = DEFAULT_TIMEOUT) {
    const self = ctx.self();
    const ref = ctx.ref();

    const mref = ctx.monitor(pid);
    ctx.send(pid, t($gen_call, t(self, ref), message));

    return ctx.receiveBlock((match, after) => {
        match(t(ref, _)).then(([ref, response]) => {
            ctx.demonitor(mref);
            log(ctx, 'doCall(%o, %o) : response : %o', pid, ref, response);
            return response;
        });
        match(t(DOWN, mref, _, pid, _)).then(([, ref, , pid, reason]) => {
            log(ctx, 'doCall(%o, %o) : throw OTPError(%o)', pid, ref, reason);
            throw new OTPError(reason);
        });
        after(timeout).then(() => {
            throw OTPError(otp.Symbols.timeout);
        });
    });
}

export const cast = clauses(function routeCast(route) {
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
    return kase(process).of((match) => {
        match(isKeyedSymbol).then((process) => {
            const result = ctx.whereis(process);
            log(ctx, 'doForProcess(%o) : found : %o', process, result);
            if (result === undefined) {
                throw OTPError('noproc');
            } else {
                log(ctx, 'fun(%o)', result);
                return fun(result);
            }
        });
        match(t(_, _)).then((process) => {
            const [_name, node] = process;
            if (ctx.nodes().includes(node)) {
                return fun(process);
            } else {
                throw OTPError(t(nodedown, node));
            }
        });
        match(_).then((process) => {
            const error = OTPError('not_implemented');

            log(ctx, 'doForProcess(%o) : not_found', process);
            log(ctx, 'doForProcess(%o) : error : %o', error);

            throw error;
        });
    });
}

export function reply(ctx, [pid, ref], reply) {
    log(ctx, 'ctx.send(%o, %o)', pid, t(ref, reply));
    ctx.send(pid, t(ref, reply));
}
