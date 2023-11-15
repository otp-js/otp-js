import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { l, t } from '@otpjs/types';
import * as Symbols from '../symbols';

const MAX_RETRIES = 10;

const { ok, normal } = otp.Symbols;
const { _ } = matching.Symbols;
const {
    cannot_start,
    failed_to_start_child,
    ignore,
    max_retries,
    permanent,
    remove,
    temporary,
} = Symbols;
const { kase } = matching;

export function restart(ctx) {}

export async function startChildren(ctx, children) {
    const start = async (ctx, child) =>
        kase(await _doStartChild(ctx, child)).of((match) => {
            match(t(ok, undefined)).then(() => remove);
            match(t(ok, _)).then(([, { pid }]) => ({ ...child, pid }));
            match(t(ok, _, _)).then(([, { pid }]) => ({ ...child, pid }));
            match(t(error, _)).then(([, reason]) => {
                throw OTPError(t(failed_to_start_child, child.id, reason));
            });
        });

    let it = children;
    let stack = list.nil;
    while (!list.isEmpty(it)) {
        const childSpec = car(it);
        const childRecord = await start(ctx, childSpec);

        if (childRecord !== remove) {
            stack = cons(childRecord, stack);
        }
    }

    return t(ok, stack.reverse());
}

async function _doStartChild(ctx, spec, remainingAttempts = MAX_RETRIES) {
    if (remainingAttempts === 0)
        throw OTPError(t(cannot_start, spec.id, max_retries));

    const {
        restart,
        start: [start, args],
    } = spec;

    const startResult = await start(ctx, ...args);
    return _handleStartResult(ctx, spec, startResult, remainingAttempts);
}

function isTemporary(restart) {
    return () => restart === temporary;
}
() => restart === permanent || reason !== normal;

function isPermanent(restart) {
    return () => restart === permanent;
}

function isAbnormal(reason) {
    return reason !== normal;
}

async function _handleStartResult(ctx, spec, result, remainingAttempts) {
    return kase(result).of((matches) => {
        matches(t(ok, Pid.isPid)).then(([, pid]) => t(ok, { ...spec, pid }));
        matches(ignore)
            .when(isTemporary(restart))
            .then(() => t(ok, undefined));
        matches(ignore).then(() => t(ok, { ...spec, pid: null }));
        matches(t(error, _))
            .when(isTemporary(restart))
            .then((_err) => t(ok, undefined));
        matches(t(error, _))
            .when(([, reason]) => isPermanent(restart) || isAbnormal(reason))
            .then((_err) => _doStartChild(ctx, spec, remainingAttempts - 1));
        matches(_).then(() => {
            throw OTPError(t(cannot_start, spec.id, response));
        });
    });
}

export function startChild(ctx) {}
