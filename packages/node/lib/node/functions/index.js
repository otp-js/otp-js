import * as pids from './pids.js';
import * as refs from './refs.js';
import * as signals from './signals.js';
import * as spawn from './spawn.js';

export function install(node) {
    pids.install(node);
    refs.install(node);
    signals.install(node);
    spawn.install(node);
}

export { pids, refs, signals, spawn };
