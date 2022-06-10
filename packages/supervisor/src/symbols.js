import { Symbols } from '@otpjs/core';

export const simple_one_for_one = Symbol.for('simple_one_for_one');
export const one_for_one = Symbol.for('one_for_one');
export const rest_for_one = Symbol.for('rest_for_one');
export const one_for_all = Symbol.for('one_for_all');

export const which_children = Symbol.for('which_children');
export const count_children = Symbol.for('count_children');

export const brutal_kill = Symbol.for('brutal_kill');
export const ignore = Symbol.for('ignore');
export const shutdown = Symbol.for('shutdown');

export const transient = Symbol.for('transient');
export const { temporary, permanent } = Symbols;

export const failed_to_start_child = Symbol.for('failed_to_start_child');
