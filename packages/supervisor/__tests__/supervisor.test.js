'use strict';

import debug from 'debug';
import '@otpjs/test_utils';
import { Node, Symbols, Pid, compile } from '@otpjs/core';
import * as supervisor from '../src';
import * as Adder from './adder';
import * as Subtracter from './subtracter';

const { ok, _, trap_exit, EXIT, normal, kill, spread } = Symbols;
const { one_for_one, simple_one_for_one, one_for_all, rest_for_one } = supervisor.Symbols;

const log = debug('otpjs:supervisor:__tests__')

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
                return [ok, [one_for_one, []]]
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
                            log('init(...%o)', args);
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
                            log('callbacks.init()');
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
                        { id: 'adder', pid: Pid.isPid, [spread]: _ },
                        { id: 'subtracter', pid: Pid.isPid, [spread]: _ },
                    ])
                });

                it('restarts the processes when they die', async function() {
                    let response;
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const [, children] = await supervisor.whichChildren(ctx, pid);

                    const pids = children.map(
                        ({ pid }) => pid
                    );

                    pids.forEach((pid) => ctx.exit(pid, kill));
                    pids.forEach((pid) => expect(node.processInfo(pid)).toBe(null));

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
            });
        })
    });
});
