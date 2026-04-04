import { t } from '@otpjs/types';
import { restartMultipleChildren, splitChild } from './common.js';
export { rest_for_one as name } from '#symbols';
export { standardStartChild as startChild, startChildren } from './common.js';

function log(ctx, ...formatters) {
    ctx.log.extend('rest_for_one')(...formatters);
}

export async function restart(ctx, state, id, pid) {
    const { name, children } = state;
    const [before, after] = splitChild(id, children);
    const [child] = after;

    log(ctx, 'restart(before: %o, after: %o)', before, after);

    const [result, nextChildren] = await restartMultipleChildren(
        ctx,
        child,
        after,
        name
    );
    return t(result, { ...state, children: before.append(nextChildren) });
}
