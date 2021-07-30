import * as core from '@otpjs/core';
import { caseOf, OTPError } from '@otpjs/core';
import { caseClause } from '@otpjs/core/lib/symbols';
import * as proc_lib from '@otpjs/proc_lib';

const { ok, error, _ } = core.Symbols;

const DEFAULT_TIMEOUT = 5000;

const localName = ['local', _];
const isPid = core.Pid.isPid;

function where(ctx, name) {
    const compare = core.caseOf(name);

    if (compare(localName)) {
        return ctx.whereis(getName(name))
    } else if (compare(isPid)) {
        return name;
    }
}

export function start(ctx, genCallbacks, link, name, callbacks, args, options) {
    const pid = where(ctx, name);
    if (pid === undefined) {
        doSpawn(ctx, genCallbacks, link, name, callbacks, args, options)
    }
}

function doSpawn(ctx, genCallbacks, link, name, callbacks, args, options) {
    if (link === 'link') {
        const timeout = 'timeout' in options
            ? options.timeout
            : Infinity;
        proc_lib.startLink(
            ctx,
            initializer(
                ctx,
                genCallbacks,
                name,
                callbacks,
                args,
                options
            ),
            timeout
        )
    } else if (link === 'monitor') {
        throw new OTPError(['not_yet_implemented', link]);
    } else {
        const timeout = 'timeout' in options
            ? options.timeout
            : Infinity;
        proc_lib.start(
            ctx,
            initializer(
                ctx,
                genCallbacks,
                name,
                callbacks,
                args,
                options
            ),
            timeout
        )
    }
}

function initializer(caller, genCallbacks, name, callbacks, args, options) {
    const starter = caller.self();
    return function initialize(ctx) {
        const response = registerName(ctx, name)
        const compare = core.caseOf(response);
        if (compare(ok)) {
            genCallbacks.initialize(
                ctx,
                starter,
                name,
                callbacks,
                args,
                options
            )
        } else if (compare([false, core.Pid.isPid])) {
            const [, pid] = response;
            proc_lib.initAck(
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
    const compare = core.caseOf(name);
    if (compare(localName)) {
        if (ctx.register(name[1])) {
            return true;
        } else {
            return [false, where(name)];
        }
    } else if (compare(isPid)) {
        return true;
    }
}

export function getName(name) {
    const compare = core.caseOf(name);

    if (compare(localName)) {
        return name[1];
    } else if (compare(isPid)) {
        return name;
    } else {
        throw new OTPError([caseClause, name]);
    }
}


export function unregisterName(ctx, name) {
    const compare = core.caseOf(name);

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

export function call(ctx, pid, message, timeout = DEFAULT_TIMEOUT) {
  const compare = caseOf(pid);

  if (compare(isPid)) {

  }
}

export function reply() {
}

export function stop() {
}
