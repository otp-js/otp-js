import * as matching from '@otpjs/matching';
import { car, cdr, cons, l, List, t } from '@otpjs/types';
import { isTemporary, restartMultipleChildren } from './common.js';
export {
    standardStartChild as startChild,
    startChildren,
    cleanup,
} from './common.js';
export { one_for_all as name } from '#symbols';

const { _, spread } = matching.Symbols;

export async function restart(ctx, state, id, pid) {
    let { name, children } = state;
    const child = findChildById(id, children);
    //children = deleteChild(ctx, id, children);

    const [result, nextChildren] = await restartMultipleChildren(
        ctx,
        child,
        children,
        name
    );

    return t(result, { ...state, children: nextChildren });
}

export function findChildById(id, children) {
    const withId = matching.compile({ id, [spread]: _ });
    return children.find(withId);
}

export function deleteChild(ctx, id, children) {
    let node = children;
    let stack = l.nil;

    while (List.isList(node) && node != l.nil) {
        const child = car(node);

        if (child.id != id) {
            stack = cons(child, stack);
        } else if (!isTemporary(child)) {
            stack = cons({ ...child, pid: null }, stack);
        }

        node = cdr(node);
    }

    return stack.reverse();
}
