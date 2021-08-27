import * as Core from '@otpjs/core';
import { caseOf, OTPError, Pid } from '@otpjs/core';
import { caseClause, DOWN } from '@otpjs/core/lib/symbols';
import * as proc_lib from '@otpjs/proc_lib';
import * as Symbols from './symbols';

export { Symbols };

const { monitor, link, nolink } = Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('gen')(...args);
}

const { ok, error, _, EXIT } = Core.Symbols;

const DEFAULT_TIMEOUT = 5000;

const localName = ['local', _];
const isPid = Core.Pid.isPid;

function where(ctx, name) {
    const compare = Core.caseOf(name);

    if (compare(localName)) {
        return ctx.whereis(getName(name))
    } else {
        return undefined;
    }
}

export function start(ctx, linking, name, init_it, options = {}) {
    const response = where(ctx, name);
    const compare = Core.caseOf(response);
    if (compare(undefined)) {
        return doSpawn(ctx, linking, name, init_it, options)
    } else if (compare([error, Pid.isPid])) {
        const [, pid] = response;
        throw new OTPError(['already_started', pid]);
    }
}

function doSpawn(ctx, linking, name, init_it, options) {
    log(ctx, 'doSpawn() : linking : %o', linking);
    if (linking === link) {
        const timeout = 'timeout' in options
            ? options.timeout
            : Infinity;
        log(ctx, 'doSpawn() : proc_lib.startLink()');
        return proc_lib.startLink(
            ctx,
            initializer(
                name,
                init_it,
                options
            ),
            timeout
        )
    } else if (linking === monitor) {
        log(ctx, 'doSpawn() : proc_lib.startMonitor()');
        throw new OTPError(['not_yet_implemented', link]);
    } else if (linking === nolink) {
        const timeout = 'timeout' in options
            ? options.timeout
            : Infinity;
        log(ctx, 'doSpawn() : proc_lib.start()');
        return proc_lib.start(
            ctx,
            initializer(
                name,
                init_it,
                options
            ),
            timeout
        )
    } else {
        throw new OTPError(badarg);
    }
}

function initializer(name, initIt, options) {
    return async function initialize(ctx, starter) {
        const response = registerName(ctx, name)
        log(ctx, 'initialize() : registerName(%o) -> %o', name, response);
        log(ctx, 'initialize() : initIt : %o', initIt);
        const compare = Core.caseOf(response);
        if (compare(ok)) {
            log(ctx, "initialize() : initIt(%o)", starter);
            return initIt(ctx, starter);
        } else if (compare([false, Core.Pid.isPid])) {
            const [, pid] = response;
            return proc_lib.initAck(
                ctx,
                starter,
                [
                    error,
                    ['already_started', pid]
                ]
            )
        }
    }
}

export function registerName(ctx, name) {
    const compare = Core.caseOf(name);
    if (compare(localName)) {
        if (ctx.register(name[1])) {
            return ok;
        } else {
            return [false, where(name)];
        }
    } else if (compare(isPid)) {
        return ok;
    } else {
        return ok;
    }
}

export function getName(name) {
    const compare = Core.caseOf(name);

    if (compare(localName)) {
        return name[1];
    } else if (compare(isPid)) {
        return name;
    } else {
        throw new OTPError([caseClause, name]);
    }
}


export function unregisterName(ctx, name) {
    const compare = Core.caseOf(name);

    if (compare(localName)) {
        try {
            ctx.unregister(name[1]);
        } finally {
            return ok;
        }
    } else if (compare(isPid)) {
        return ok;
    } else {
        throw new OTPError([caseClause, name]);
    }
}

export async function call(ctx, pid, message, timeout = DEFAULT_TIMEOUT) {
    const compare = caseOf(pid);
    if (compare(Pid.isPid)) {
        return doCall(ctx, pid, message, timeout);
    } else {
        const fun = (pid) => doCall(ctx, pid, message, timeout);
        return doForProcess(pid, fun);
    }
}

const callReplyPattern = ref => Core.compile([
    ref,
    _
]);
const downPattern = pid => [DOWN, pid, _];
async function doCall(ctx, pid, message, timeout) {
    const self = ctx.self();
    const ref = ctx.ref();

    try {
        ctx.monitor(pid);
        ctx.send(pid, [
            Symbols.call,
            [self, ref],
            message
        ]);

        const isReply = callReplyPattern(ref);
        const isDown = downPattern(pid);
        const mref = ctx.monitor(pid);
        log(
            ctx,
            'doCall(%o, %o) : receive(%o, %o)',
            pid,
            message,
            isReply,
            isDown
        );
        const [ret, predicate] = await ctx.receiveWithPredicate(
            isDown,
            isReply,
            timeout
        );

        log(ctx, 'doCall(%o, %o) : ret : %o', pid, message, ret)
        log(ctx, 'doCall(%o, %o) : predicate : %o', pid, message, predicate)
        if (predicate === isReply) {
            const [ref, response] = ret;
            ctx.demonitor(mref);
            log(ctx, 'doCall(%o, %o) : response : %o', pid, message, response);
            return response;
        } else if (predicate === isDown) {
            const [DOWN, pid, reason] = ret;
            log(ctx, 'doCall(%o, %o) : throw OTPError(%o)', pid, message, reason);
            throw new OTPError(reason);
        }
    } catch (err) {
        log(ctx, 'doCall(%o, %o, %o) : error : %o', pid, message, timeout, err);
        throw new OTPError([
            EXIT,
            self,
            err.message,
            err.stack
        ]);
    }
}

export function cast(ctx, pid, message) {
    if (Pid.isPid(pid)) {
        return doCast(ctx, pid, message);
    } else {
        const fun = pid => doCast(ctx, pid, message);
        return doForProcess(pid, fun);
    }
}

function doCast(ctx, pid, message) {
    ctx.send(pid, [Symbols.cast, message]);
}

function doForProcess(process, fun) {
    // TODO: look up process (which is not a Pid)
    // As of the time of this comment, core/node handles routing remote messages
    return fun(process);
}

export function reply(ctx, [pid, ref], reply) {
    log(ctx, 'ctx.send(%o, %o)', pid, [ref, reply]);
    ctx.send(pid, [ref, reply]);
}

export function stop() {
}
