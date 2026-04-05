import { ok, error } from '@otpjs/core/symbols';
import { _ } from '@otpjs/matching/symbols';
import { noreply } from '@otpjs/gen_server/symbols';
import { kase } from '@otpjs/matching';
import { car, cdr, cons, t, list } from '@otpjs/types';
import { updatePid, startChild as doStartChild } from './common.js';
export { standardStartChild as startChild, cleanup } from './common.js';
export { one_for_one as name } from '#symbols';
import { remove } from '#symbols';

function getSpecById(ctx, id, specs) {
    return specs.find((child) => child.id == id);
}

export async function restart(ctx, state, id, pid) {
    const [, newSpec] = await doStartChild(
        ctx,
        getSpecById(ctx, id, state.childSpecs)
    );
    return t(ok, updatePid(state, id, newSpec.pid));
}

export async function startChildren(ctx, children) {
    const start = async (ctx, child) =>
        kase(await doStartChild(ctx, child)).of((match) => {
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

        it = cdr(it);
    }

    return t(ok, stack.reverse());
}
