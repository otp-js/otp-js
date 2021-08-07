'use strict';

import { Node, Pid, Symbols } from '@otpjs/core';
import '@otpjs/test_utils';
import debug from 'debug';
import * as supervisor from '../src';
import * as Adder from './adder';
import * as Subtracter from './subtracter';

const { ok, _, trap_exit, EXIT, normal, kill, spread } = Symbols;
const { one_for_one, simple_one_for_one, one_for_all, rest_for_one } = supervisor.Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('supervisor:__tests__')(...args);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('@otp-js/supervisor', () => {
    let node = null;
    let ctx = null;
    let args = null;
    let callbacks = null;

    beforeEach(function() {
        node = new Node();
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);
        args = [];
        callbacks = {
            init: jest.fn(() => {
                return [ok, [{ strategy: one_for_one }, []]]
            }),
        };
    })

    it('can start a linked process', async function() {
        expect(supervisor.startLink).toBeInstanceOf(Function);

        const pattern = [ok, Pid.isPid];
        const start = supervisor.startLink(
            ctx,
            callbacks,
            args
        );
        await expect(start).resolves.toMatchPattern(pattern)
    });

    describe('describes a process pattern', function() {
        describe('using callbacks', function() {
            describe('init', function() {
                it('should be used at spawn time', async function() {
                    const [ok, pid] = await supervisor.startLink(ctx, callbacks, args);
                    expect(callbacks.init).toHaveBeenCalled();
                });

                it('receives the arguments from the start call', async function() {
                    const arg1 = Math.random();
                    const arg2 = Symbol.for('$otp.supervisor.test_arg');
                    let received = null;
                    const callbacks = {
                        init: jest.fn((ctx, ...args) => {
                            log(ctx, 'init(...%o)', args);
                            received = args;
                            return [ok, null]
                        }),
                    }
                    const [, pid] = await supervisor.startLink(ctx, callbacks, [arg1, arg2]);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    expect(callbacks.init).toHaveBeenCalled();
                    expect(received).toMatchPattern([arg1, arg2]);
                });
            });
        });
    });

    describe('when started', function() {
        describe('with a valid initializer', function() {
            describe('for a one_for_one strategy', function() {
                let config = null;
                let callbacks = null;
                let adder = null;
                let subtracter = null;

                beforeEach(function() {
                    adder = jest.fn(Adder.startLink);
                    subtracter = jest.fn(Subtracter.startLink);
                    config = [
                        {
                            strategy: one_for_one,
                        },
                        [
                            {
                                id: 'adder',
                                start: [adder, [1, 2, 3]]
                            },
                            {
                                id: 'subtracter',
                                start: [subtracter, [1, 2, 3]]
                            }
                        ]
                    ];

                    callbacks = {
                        init: jest.fn((ctx, ...args) => {
                            log(ctx, 'callbacks.init()');
                            return [ok, config];
                        })
                    };
                });

                it('spawns the processes defined by the initializer', async function() {
                    let response;
                    expect(function() {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();

                    await expect(response).resolves.toMatchPattern([ok, Pid.isPid]);

                    const [, pid] = await response;

                    await expect(supervisor.countChildren(ctx, pid)).resolves.toBe(2);
                    await expect(supervisor.whichChildren(ctx, pid)).resolves.toMatchPattern([
                        ok,
                        [
                            { id: 'adder', pid: Pid.isPid, [spread]: _ },
                            { id: 'subtracter', pid: Pid.isPid, [spread]: _ },
                        ]
                    ])

                    node.exit(pid, kill);
                });

                it('restarts the processes when they die', async function() {
                    let response;
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    log(ctx, 'spawned : %o', pid);

                    const [, children] = await supervisor.whichChildren(ctx, pid);

                    log(ctx, 'children() : %o', children);
                    await wait(10);

                    for (let child of children) {
                        const { pid } = child;
                        log(ctx, 'exit(%o, kill)', pid);
                        ctx.exit(pid, kill);
                    }

                    await wait(10);

                    for (let child of children) {
                        const { pid } = child;
                        expect(node.processInfo(pid)).toMatchPattern({
                            dead: true,
                            [spread]: _
                        });
                    }

                    const [, nextChildren] = await supervisor.whichChildren(ctx, pid);
                    expect(nextChildren).toMatchPattern([
                        { id: 'adder', pid: Pid.isPid },
                        { id: 'subtracter', pid: Pid.isPid },
                    ]);

                });
            });

            describe('for a one_for_all strategy', function() {
            });
            describe('for a rest_for_one strategy', function() {
            });
            describe('for a simple_one_for_one strategy', function() {
                let start;
                beforeEach(function() {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = jest.fn(Adder.startLink);
                    callbacks = {
                        init: jest.fn(() => {
                            return [
                                ok,
                                [
                                    { strategy: simple_one_for_one },
                                    [
                                        {
                                            start: [start, [1, 2, 3]]
                                        },
                                    ]
                                ]
                            ]
                        }),
                    };
                });
                it('spawns no processes after initializing', async function() {
                    let response;
                    expect(function() {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();
                    await expect(response).resolves.toMatchPattern([ok, Pid.isPid]);

                    const [, pid] = await response;

                    await expect(supervisor.countChildren(ctx, pid)).resolves.toBe(0);
                    await expect(supervisor.whichChildren(ctx, pid)).resolves.toMatchPattern([
                        ok,
                        []
                    ]);

                    expect(start).not.toHaveBeenCalled();
                    expect(callbacks.init.mock.results[0].value).toMatchPattern([
                        ok,
                        [
                            { strategy: simple_one_for_one },
                            [
                                spread
                            ]
                        ]
                    ])
                });
                it('spawns processes when startChild is called', async function() {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    for (let i = 0; i < 10; i++) {
                        log(ctx, 'startChild(%o)', i);
                        const response = supervisor.startChild(ctx, pid, [i])

                        await expect(response).resolves.toMatchPattern([
                            ok,
                            Pid.isPid
                        ]);

                        const [, child] = await response;

                        expect(start).toHaveBeenCalledTimes(i + 1);
                        expect(start.mock.calls[i][4]).toMatchPattern(i);
                        await expect(start.mock.results[i].value).resolves.toMatchPattern([
                            ok,
                            Pid.isPid
                        ]);

                        // Adder adds six by default, we have extended with i
                        await expect(Adder.get(ctx, child)).resolves.toMatchPattern(i + 6);
                    }

                    await expect(supervisor.countChildren(ctx, pid))
                        .resolves.toMatchPattern(10)
                });
            });
        })
    });
});