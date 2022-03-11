import * as match from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import { case_clause, DOWN } from '@otpjs/core/lib/symbols';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };

const { monitor, link, nolink, $gen_call, $gen_cast } = Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('gen')(...args);
}

const { ok, error, _, nodedown, EXIT } = match.Symbols;

const DEFAULT_TIMEOUT = 5000;

const localName = t('local', _);
const isPid = Pid.isPid;

function where(ctx, name) {
    const compare = match.caseOf(name);

    if (compare(localName)) {
        return ctx.whereis(getName(name));
    } else {
        return undefined;
    }
}

export function start(ctx, linking, name, init_it, options = {}) {
    const response = where(ctx, name);
    const compare = match.caseOf(response);
    if (compare(undefined)) {
        return doSpawn(ctx, linking, name, init_it, options);
    } else if (compare(t(error, Pid.isPid))) {
        const [, pid] = response;
        throw new OTPError(t('already_started', pid));
    }
}

function doSpawn(ctx, linking, name, init_it, options) {
    log(ctx, 'doSpawn() : linking : %o', linking);
    if (linking === link) {
        const timeout = 'timeout' in options ? options.timeout : Infinity;
        log(ctx, 'doSpawn() : proc_lib.startLink()');
        return proc_lib.startLink(
            ctx,
            initializer(name, init_it, options),
            timeout
        );
    } else if (linking === monitor) {
        log(ctx, 'doSpawn() : proc_lib.startMonitor()');
        throw new OTPError(t('not_yet_implemented', link));
    } else if (linking === nolink) {
        const timeout = 'timeout' in options ? options.timeout : Infinity;
        log(ctx, 'doSpawn() : proc_lib.start()');
        return proc_lib.start(
            ctx,
            initializer(name, init_it, options),
            timeout
        );
    } else {
        throw new OTPError(badarg);
    }
}

function initializer(name, initIt, options) {
    return async function initialize(ctx, starter) {
        const response = registerName(ctx, name);
        log(ctx, 'initialize() : registerName(%o) -> %o', name, response);
        log(ctx, 'initialize() : initIt : %o', initIt);
        const compare = match.caseOf(response);
        if (compare(ok)) {
            log(ctx, 'initialize() : initIt(%o)', starter);
            return initIt(ctx, starter);
        } else if (compare(t(false, Pid.isPid))) {
            const [, pid] = response;
            return proc_lib.initAck(
                ctx,
                starter,
                t(error, t('already_started', pid))
            );
        }
    };
}

export function registerName(ctx, name) {
    const compare = match.caseOf(name);
    if (compare(localName)) {
        if (ctx.register(getName(name))) {
            return ok;
        } else {
            return t(false, where(name));
        }
    } else if (compare(isPid)) {
        return ok;
    } else {
        return ok;
    }
}

export function getName(name) {
    const compare = match.caseOf(name);

    if (compare(localName)) {
        return name[1];
    } else if (compare(isPid)) {
        return name;
    } else {
        throw new OTPError(t(case_clause, name));
    }
}

export function unregisterName(ctx, name) {
    const compare = match.caseOf(name);

    if (compare(localName)) {
        try {
            ctx.unregister(name[1]);
        } finally {
            return ok;
        }
    } else if (compare(isPid)) {
        return ok;
    } else {
        throw new OTPError(t(case_clause, name));
    }
}

export async function call(ctx, pid, message, timeout = DEFAULT_TIMEOUT) {
    if (Pid.isPid(pid)) {
        log(ctx, 'call(%o) : isPid', pid);
        return doCall(ctx, pid, message, timeout);
    } else {
        const fun = (pid) => doCall(ctx, pid, message, timeout);
        log(ctx, 'call(%o) : isNotPid', pid);
        return doForProcess(ctx, pid, fun);
    }
}

const callReplyPattern = (ref) => match.compile(t(ref, _));
const downPattern = (mref, pid) => match.compile(t(DOWN, mref, _, pid, _));
async function doCall(ctx, pid, message, timeout) {
    const self = ctx.self();
    const ref = ctx.ref();

    try {
        const mref = ctx.monitor(pid);
        const isReply = callReplyPattern(ref);
        const isDown = downPattern(mref, pid);

        ctx.send(pid, t($gen_call, t(self, ref), message));
        log(ctx, 'doCall(%o, %o) : receive(%o, %o)', pid, ref, isReply, isDown);
        const [ret, predicate] = await ctx.receiveWithPredicate(
            isDown,
            isReply,
            timeout
        );

        log(ctx, 'doCall(%o, %o) : ret : %o', pid, ref, ret);
        log(ctx, 'doCall(%o, %o) : predicate : %o', pid, ref, predicate);
        if (predicate === isReply) {
            const [ref, response] = ret;
            ctx.demonitor(mref);
            log(ctx, 'doCall(%o, %o) : response : %o', pid, ref, response);
            return response;
        } else if (predicate === isDown) {
            const [DOWN, ref, type, pid, reason] = ret;
            log(ctx, 'doCall(%o, %o) : throw OTPError(%o)', pid, ref, reason);
            throw new OTPError(reason);
        } else {
            log(
                ctx,
                'doCall(%o, %o) : unrecognized_predicate : %o',
                pid,
                ref,
                predicate
            );
            throw new OTPError(t('unrecognized_predicate', predicate));
        }
    } catch (err) {
        log(ctx, 'doCall(%o, %o, %o) : error : %o', pid, ref, timeout, err);
        throw err;
    }
}

export function cast(ctx, pid, message) {
    if (Pid.isPid(pid)) {
        return doCast(ctx, pid, message);
    } else {
        const fun = (pid) => doCast(ctx, pid, message);
        return doForProcess(ctx, pid, fun);
    }
}

function doCast(ctx, pid, message) {
    ctx.send(pid, t($gen_cast, message));
}

const isString = (v) => typeof v === 'string';
const isKeyedSymbol = (v) =>
    typeof v === 'symbol' && Symbol.keyFor(v) !== undefined;
function doForProcess(ctx, process, fun) {
    // TODO: look up process (which is not a Pid)
    // As of the time of this comment, core/node handles routing remote messages
    const compare = match.caseOf(process);

    if (compare(Pid.isPid)) {
        log(ctx, 'doForProcess(%o) : found : %o', process, process);
        return fun(process);
    } else if (compare(isString) || compare(isKeyedSymbol)) {
        const result = ctx.whereis(process);
        log(ctx, 'doForProcess(%o) : found : %o', process, result);
        if (result === undefined) {
            return ctx.exit('noproc');
        } else {
            log(ctx, 'fun(%o)', result);
            return fun(result);
        }
    } else if (compare(t(_, _))) {
        const [name, node] = process;
        if (ctx.nodes().includes(node)) {
            return fun(process);
        } else {
            ctx.exit(t(nodedown, node));
        }
    } else {
        log(ctx, 'doForProcess(%o) : not_found', process);
        log(
            ctx,
            'doForProcess(%o) : error : %o',
            new OTPError('not_implemented')
        );
    }
}

export function reply(ctx, [pid, ref], reply) {
    log(ctx, 'ctx.send(%o, %o)', pid, t(ref, reply));
    ctx.send(pid, t(ref, reply));
}

export function stop() {}
