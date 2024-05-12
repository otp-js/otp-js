import * as pids from './pids';
import * as refs from './refs';
import * as signals from './signals';
import * as spawn from './spawn';

export function install(node) {
    pids.install(node);
    refs.install(node);
    signals.install(node);
    spawn.install(node);
}

export { pids, refs, signals, spawn };
