import { Symbols, caseOf } from '@otpjs/core';
import { t, l } from '@otpjs/types';
import * as proc_lib from '@otpjs/proc_lib';

const { ok } = Symbols;

function process(ctx, caller, ...values) {
    const response = values.reduce((acc, n) => acc + n, 0);
    return proc_lib.initAck(ctx, caller, t(ok, ctx.self(), response));
}

export function start(ctx, ...values) {
    return proc_lib.start(ctx, (ctx, caller) =>
        process(ctx, caller, ...values)
    );
}

export function startLink(ctx, ...args) {
    return proc_lib.startLink(ctx, (ctx, caller) =>
        process(ctx, caller, ...values)
    );
}
