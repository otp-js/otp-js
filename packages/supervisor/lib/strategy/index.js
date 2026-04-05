import * as OneForAll from './one_for_all.js';
import * as OneForOne from './one_for_one.js';
import * as RestForOne from './rest_for_one.js';
import * as SimpleOneForOne from './simple_one_for_one.js'
import { one_for_all, one_for_one, rest_for_one, simple_one_for_one } from '#symbols';

const lookup = new Map([
    [one_for_all, OneForAll],
    [one_for_one, OneForOne],
    [rest_for_one, RestForOne],
    [simple_one_for_one, SimpleOneForOne]
]);

export function getStrategy(strategy) {
    if (lookup.has(strategy)) {
        return lookup.get(strategy);
    } else {
        throw Error(`invalid strategy: ${Symbol.keyFor(strategy)}`)
    }
}

export { OneForAll, OneForOne, RestForOne, SimpleOneForOne }
