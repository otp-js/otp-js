/* eslint-env jest */

import { Node, Pid, Symbols } from '@otpjs/core';
import '@otpjs/test_utils';
import * as supervisor from '../src';
import * as Adder from './adder';
import * as Subtracter from './subtracter';
import * as Ignored from './ignored';
import * as Failed from './failed';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { t, l } from '@otpjs/types';

const { error, ok, trap_exit, normal, kill, badarg, timeout } = Symbols;
const { _, spread } = matching.Symbols;
const {
    one_for_one,
    simple_one_for_one,
    one_for_all,
    rest_for_one,
    transient,
    permanent,
    temporary
} = supervisor.Symbols;
const { stop } = gen_server.Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('supervisor:__tests__')(...args);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@otp-js/supervisor', () => {
    let node = null;
    let ctx = null;
    let args = null;
    let callbacks = null;

    beforeEach(function () {
        node = new Node();
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);
        args = [];
        callbacks = {
            init: jest.fn(function () {
                return t(ok, t({ strategy: one_for_one }, l()));
            })
        };
    });

    it('can start a linked process', async function () {
        expect(supervisor.startLink).toBeInstanceOf(Function);

        const pattern = t(ok, Pid.isPid);
        const start = supervisor.startLink(ctx, callbacks, args);
        await expect(start).resolves.toMatchPattern(pattern);
    });

    it('ignores unsupported calls', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks, args);
        await expect(
            gen_server.call(ctx, pid, 'nonsense', 500)
        ).rejects.toThrowTerm(timeout);
    });

    it('ignores unsupported casts', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks, args);
        await expect(gen_server.cast(ctx, pid, 'nonsense')).resolves.toBe(ok);
        await wait(50);
        expect(ctx.processInfo(pid)).not.toBeUndefined();
    });

    describe('describes a process pattern', function () {
        describe('using callbacks', function () {
            describe('init', function () {
                it('should be used at spawn time', async function () {
                    const [ok, pid] = await supervisor.startLink(
                        ctx,
                        callbacks,
                        args
                    );
                    expect(callbacks.init).toHaveBeenCalled();
                });
                it('receives the arguments from the start call', async function () {
                    const arg1 = Math.random();
                    const arg2 = Symbol.for('$otp.supervisor.test_arg');
                    let received = null;
                    const callbacks = {
                        init: jest.fn((ctx, ...args) => {
                            log(ctx, 'init(...%o)', args);
                            received = args;
                            return t(ok, null);
                        })
                    };
                    const [, pid] = await supervisor.startLink(
                        ctx,
                        callbacks,
                        l(arg1, arg2)
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    expect(callbacks.init).toHaveBeenCalled();

                    // use of spread operator means we'll capture this as an array
                    expect(received).toMatchPattern([arg1, arg2]);
                });
                it('may indicate to stop', async function () {
                    const callbacks = {
                        init: () => t(stop, badarg)
                    };

                    const startPromise = supervisor.startLink(ctx, callbacks);
                    await expect(startPromise).resolves.not.toThrow();
                    await expect(startPromise).resolves.toMatchPattern(
                        t(error, badarg)
                    );
                });
                it('may fail to start correctly', async function () {
                    const callbacks = {
                        init: () => badarg
                    };

                    const startPromise = supervisor.startLink(ctx, callbacks);
                    await expect(startPromise).resolves.not.toThrow();
                    await expect(startPromise).resolves.toMatchPattern(
                        t(error, 'bad_init')
                    );
                });
            });
        });
    });
    describe('when started', function () {
        describe('with a valid initializer', function () {
            describe('and a child does not start', function () {
                describe('due to an ignore response', function () {
                    let start;
                    let startIgnore;

                    beforeEach(function () {
                        node = new Node();
                        ctx = node.makeContext();
                        ctx.processFlag(trap_exit, true);
                        args = [];
                        start = jest.fn(Adder.startLink);
                        startIgnore = jest.fn(Ignored.startLink);
                        callbacks = {
                            init: jest.fn(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: one_for_all },
                                        l(
                                            {
                                                id: 'a',
                                                start: [start, [1, 2, 3]],
                                                restart: transient
                                            },
                                            {
                                                id: 'b',
                                                start: [start, [4, 5, 6]],
                                                restart: transient
                                            },
                                            {
                                                id: 'c',
                                                start: [startIgnore, []],
                                                restart: transient
                                            },
                                            {
                                                id: 'd',
                                                start: [start, [7, 8, 9]],
                                                restart: transient
                                            },
                                            {
                                                id: 'e',
                                                start: [start, [10, 11, 12]],
                                                restart: transient
                                            }
                                        )
                                    )
                                );
                            })
                        };
                    });

                    it('continues to start the remaining children', async function () {
                        const startPromise = supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        await expect(startPromise).resolves.not.toThrow();
                        await expect(startPromise).resolves.toMatchPattern(
                            t(ok, Pid.isPid)
                        );
                        const [, pid] = await startPromise;

                        const living = { pid: Pid.isPid, [spread]: _ };
                        const dead = { pid: null, [spread]: _ };

                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).resolves.toMatchPattern(
                            t(ok, l(living, living, dead, living, living))
                        );
                    });

                    describe('from a temporary child', function () {
                        beforeEach(function () {
                            callbacks = {
                                init: jest.fn(() => {
                                    return t(
                                        ok,
                                        t(
                                            { strategy: one_for_all },
                                            l(
                                                {
                                                    id: 'a',
                                                    start: [start, [1, 2, 3]],
                                                    restart: transient
                                                },
                                                {
                                                    id: 'b',
                                                    start: [start, [4, 5, 6]],
                                                    restart: transient
                                                },
                                                {
                                                    id: 'c',
                                                    start: [startIgnore, []],
                                                    restart: temporary
                                                },
                                                {
                                                    id: 'd',
                                                    start: [start, [7, 8, 9]],
                                                    restart: transient
                                                },
                                                {
                                                    id: 'e',
                                                    start: [
                                                        start,
                                                        [10, 11, 12]
                                                    ],
                                                    restart: transient
                                                }
                                            )
                                        )
                                    );
                                })
                            };
                        });
                        it('removes the child spec', async function () {
                            const [, pid] = await supervisor.startLink(
                                ctx,
                                callbacks
                            );

                            const living = { pid: Pid.isPid, [spread]: _ };
                            const dead = { pid: null, [spread]: _ };

                            await expect(
                                supervisor.whichChildren(ctx, pid)
                            ).resolves.toMatchPattern(
                                t(ok, l(living, living, living, living))
                            );
                        });
                    });
                });
                describe('due to an error', function () {});
            });
            describe('for a one_for_one strategy', function () {
                let config = null;
                let callbacks = null;
                let adder = null;
                let subtracter = null;

                beforeEach(function () {
                    adder = jest.fn(Adder.startLink);
                    subtracter = jest.fn(Subtracter.startLink);
                    config = t(
                        {
                            strategy: one_for_one
                        },
                        l(
                            {
                                id: 'adder',
                                start: [adder, [1, 2, 3]],
                                restart: transient
                            },
                            {
                                id: 'subtracter',
                                start: [subtracter, [1, 2, 3]],
                                restart: transient
                            }
                        )
                    );

                    callbacks = {
                        init: jest.fn((ctx, ...args) => {
                            log(ctx, 'callbacks.init()');
                            return t(ok, config);
                        })
                    };
                });

                it('spawns the processes defined by the initializer', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();

                    await expect(response).resolves.toMatchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).resolves.toBe(2);
                    await expect(
                        supervisor.whichChildren(ctx, pid)
                    ).resolves.toMatchPattern(
                        t(
                            ok,
                            l(
                                { id: 'adder', pid: Pid.isPid, [spread]: _ },
                                {
                                    id: 'subtracter',
                                    pid: Pid.isPid,
                                    [spread]: _
                                }
                            )
                        )
                    );

                    node.exit(node.system, pid, kill);
                });
                it('restarts the processes when they die', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    log(ctx, 'spawned : %o', pid);

                    const [, children] = await supervisor.whichChildren(
                        ctx,
                        pid
                    );

                    log(ctx, 'children() : %o', children);
                    await wait(10);

                    for (const child of children) {
                        const { pid } = child;
                        log(ctx, 'exit(%o, kill)', pid);
                        ctx.exit(pid, kill);
                    }

                    await wait(10);

                    for (const child of children) {
                        const { pid } = child;
                        expect(node.processInfo(pid)).toBeUndefined();
                    }

                    const [, nextChildren] = await supervisor.whichChildren(
                        ctx,
                        pid
                    );
                    log(ctx, 'nextChildren: %o', nextChildren);
                    expect(nextChildren).toMatchPattern(
                        l(
                            { id: 'adder', pid: Pid.isPid },
                            { id: 'subtracter', pid: Pid.isPid }
                        )
                    );
                });

                describe('startChild called', function () {
                    let start;
                    beforeEach(function () {
                        node = new Node();
                        ctx = node.makeContext();
                        ctx.processFlag(trap_exit, true);
                        args = [];
                        start = jest.fn(Adder.startLink);
                        callbacks = {
                            init: jest.fn(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: one_for_one },
                                        l({
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient
                                        })
                                    )
                                );
                            })
                        };
                    });

                    describe('the new child', function () {
                        it('starts with provided spec', async function () {
                            const [, pid] = await supervisor.startLink(
                                ctx,
                                callbacks
                            );

                            const startChildPromiseA = supervisor.startChild(
                                ctx,
                                pid,
                                {
                                    id: 'b',
                                    start: [start, [1, 2, 3]],
                                    restart: transient
                                }
                            );
                            await expect(
                                startChildPromiseA
                            ).resolves.toMatchPattern(t(ok, Pid.isPid));

                            const [, child] = await startChildPromiseA;
                            await expect(
                                gen_server.call(ctx, child, 'get')
                            ).resolves.toBe(6);

                            await expect(
                                supervisor.whichChildren(ctx, pid)
                            ).resolves.toMatchPattern(t(ok, l(_, _)));
                        });
                        describe('when it fails to start', function () {
                            describe('with a temporary restart strategy', function () {
                                it('responds with the error reason', async function () {
                                    const [, pid] = await supervisor.startLink(
                                        ctx,
                                        callbacks
                                    );

                                    await expect(
                                        supervisor.startChild(ctx, pid, {
                                            id: 'b',
                                            start: [
                                                Failed.startLink,
                                                [1, 2, 3]
                                            ],
                                            restart: temporary
                                        })
                                    ).resolves.toMatchPattern(t(error, _));
                                });
                                it('does not add the spec to the list of children', async function () {
                                    const [, pid] = await supervisor.startLink(
                                        ctx,
                                        callbacks
                                    );

                                    await expect(
                                        supervisor.startChild(ctx, pid, {
                                            id: 'b',
                                            start: [
                                                Failed.startLink,
                                                [1, 2, 3]
                                            ],
                                            restart: temporary
                                        })
                                    ).resolves.toMatchPattern(t(error, _));

                                    await expect(
                                        supervisor.whichChildren(ctx, pid)
                                    ).resolves.toMatchPattern(
                                        t(ok, l({ id: 'a', pid: Pid.isPid }))
                                    );
                                });
                            });
                            describe('with a transient restart strategy', function () {
                                it('retries the maximum number of times', async function () {
                                    const [, pid] = await supervisor.startLink(
                                        ctx,
                                        callbacks
                                    );

                                    await expect(
                                        supervisor.startChild(ctx, pid, {
                                            id: 'b',
                                            start: [
                                                Failed.startLink,
                                                [1, 2, 3]
                                            ],
                                            restart: transient
                                        })
                                    ).rejects.toThrowTerm(
                                        t('cannot_start', 'b', 'max_retries')
                                    );
                                });
                            });
                            describe('with a bad response', function () {
                                it('throws an error', async function () {
                                });
                            });
                        });
                    });
                });
            });
            describe('for a one_for_all strategy', function () {
                let start;
                beforeEach(function () {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = jest.fn(Adder.startLink);
                    callbacks = {
                        init: jest.fn(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: one_for_all },
                                    l(
                                        {
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient
                                        },
                                        {
                                            id: 'b',
                                            start: [start, [4, 5, 6]],
                                            restart: transient
                                        },
                                        {
                                            id: 'c',
                                            start: [start, [7, 8, 9]],
                                            restart: transient
                                        }
                                    )
                                )
                            );
                        })
                    };
                });

                it('spawns all processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();

                    await expect(response).resolves.toMatchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).resolves.toBe(3);
                    expect(start).toHaveBeenCalled();
                });
                it('spawns the processes declared by the init function', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const children = await supervisor.whichChildren(ctx, pid);

                    expect(children).toMatchPattern(
                        t(
                            ok,
                            l(
                                { id: 'a', [spread]: _ },
                                { id: 'b', [spread]: _ },
                                { id: 'c', [spread]: _ }
                            )
                        )
                    );
                });
                it('restarts all processes when one dies', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const children = await supervisor.whichChildren(ctx, pid);
                    const [, [{ pid: pidA1 }, { pid: pidB1 }, { pid: pidC1 }]] =
                        children;

                    await ctx.exit(pidA1, kill);
                    await wait(100);

                    const nextChildren = await supervisor.whichChildren(
                        ctx,
                        pid
                    );
                    const [, [{ pid: pidA2 }, { pid: pidB2 }, { pid: pidC2 }]] =
                        nextChildren;

                    expect(pidA1).not.toMatchPattern(pidA2);
                    expect(pidA2).toMatchPattern(Pid.isPid);

                    expect(pidB1).not.toMatchPattern(pidB2);
                    expect(pidB2).toMatchPattern(Pid.isPid);

                    expect(pidC1).not.toMatchPattern(pidC2);
                    expect(pidC2).toMatchPattern(Pid.isPid);
                });
            });
            describe('for a rest_for_one strategy', function () {
                let start;
                beforeEach(function () {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = jest.fn(Adder.startLink);
                    callbacks = {
                        init: jest.fn(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: rest_for_one },
                                    l(
                                        {
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient
                                        },
                                        {
                                            id: 'b',
                                            start: [start, [4, 5, 6]],
                                            restart: transient
                                        },
                                        {
                                            id: 'c',
                                            start: [start, [7, 8, 9]],
                                            restart: transient
                                        },
                                        {
                                            id: 'd',
                                            start: [start, [7, 8, 9]],
                                            restart: transient
                                        },
                                        {
                                            id: 'e',
                                            start: [start, [7, 8, 9]],
                                            restart: transient
                                        }
                                    )
                                )
                            );
                        })
                    };
                });

                it('spawns all processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();

                    await expect(response).resolves.toMatchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).resolves.toBe(5);
                    expect(start).toHaveBeenCalled();
                });
                it('spawns the processes declared by the init function', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const children = await supervisor.whichChildren(ctx, pid);

                    expect(children).toMatchPattern(
                        t(
                            ok,
                            l(
                                { id: 'a', [spread]: _ },
                                { id: 'b', [spread]: _ },
                                { id: 'c', [spread]: _ },
                                { id: 'd', [spread]: _ },
                                { id: 'e', [spread]: _ }
                            )
                        )
                    );
                });
                it('restarts subsequent processes when one dies', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const [, children] = await supervisor.whichChildren(
                        ctx,
                        pid
                    );
                    const [
                        { pid: pidA1 },
                        { pid: pidB1 },
                        { pid: pidC1 },
                        { pid: pidD1 },
                        { pid: pidE1 }
                    ] = children;

                    log(ctx, 'CHILDREN: %O', children);

                    await ctx.exit(pidC1, kill);
                    await wait(100);

                    const [, nextChildren] = await supervisor.whichChildren(
                        ctx,
                        pid
                    );
                    const [
                        { pid: pidA2 },
                        { pid: pidB2 },
                        { pid: pidC2 },
                        { pid: pidD2 },
                        { pid: pidE2 }
                    ] = nextChildren;

                    log(ctx, 'NEXT_CHILDREN: %O', nextChildren);

                    expect(pidA1).toMatchPattern(pidA2);
                    expect(pidA2).toMatchPattern(Pid.isPid);

                    expect(pidB1).toMatchPattern(pidB2);
                    expect(pidB2).toMatchPattern(Pid.isPid);

                    expect(pidC1).not.toMatchPattern(pidC2);
                    expect(pidC2).toMatchPattern(Pid.isPid);

                    expect(pidD1).not.toMatchPattern(pidD2);
                    expect(pidD2).toMatchPattern(Pid.isPid);

                    expect(pidE1).not.toMatchPattern(pidE2);
                    expect(pidE2).toMatchPattern(Pid.isPid);
                });
            });
            describe('for a simple_one_for_one strategy', function () {
                let start;
                beforeEach(function () {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = jest.fn(Adder.startLink);
                    callbacks = {
                        init: jest.fn(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: simple_one_for_one },
                                    l({
                                        start: [start, [1, 2, 3]],
                                        restart: transient
                                    })
                                )
                            );
                        })
                    };
                });
                it('spawns no processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.toThrow();
                    await expect(response).resolves.toMatchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).resolves.toBe(0);
                    await expect(
                        supervisor.whichChildren(ctx, pid)
                    ).resolves.toMatchPattern(t(ok, l()));

                    expect(start).not.toHaveBeenCalled();
                    expect(callbacks.init.mock.results[0].value).toMatchPattern(
                        t(ok, t({ strategy: simple_one_for_one }, l.isList))
                    );
                });
                it('spawns processes when startChild is called', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    for (let i = 0; i < 10; i++) {
                        log(ctx, 'startChild(%o)', i);
                        const response = supervisor.startChild(ctx, pid, l(i));

                        await expect(response).resolves.toMatchPattern(
                            t(ok, Pid.isPid)
                        );

                        const [, child] = await response;

                        expect(start).toHaveBeenCalledTimes(i + 1);
                        expect(start.mock.calls[i][4]).toMatchPattern(i);
                        await expect(
                            start.mock.results[i].value
                        ).resolves.toMatchPattern(t(ok, Pid.isPid));

                        // Adder adds six by default, we have extended with i
                        await expect(
                            Adder.get(ctx, child)
                        ).resolves.toMatchPattern(i + 6);
                    }

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).resolves.toMatchPattern(10);
                });
                describe('and a child does not start', function () {
                    describe('with a temporary restart', function () {
                        describe('due to an ignore response', function () {
                            let start;
                            let startIgnore;

                            beforeEach(function () {
                                node = new Node();
                                ctx = node.makeContext();
                                ctx.processFlag(trap_exit, true);
                                args = [];
                                start = jest.fn(Adder.startLink);
                                startIgnore = jest.fn(Ignored.startLink);
                                callbacks = {
                                    init: jest.fn(() => {
                                        return t(
                                            ok,
                                            t(
                                                {
                                                    strategy:
                                                        simple_one_for_one
                                                },
                                                l({
                                                    start: [startIgnore, []],
                                                    restart: temporary
                                                })
                                            )
                                        );
                                    })
                                };
                            });

                            it('drops the child spec', async function () {
                                const [, pid] = await supervisor.startLink(
                                    ctx,
                                    callbacks
                                );

                                await supervisor.startChild(ctx, pid, l());
                                expect(startIgnore).toHaveBeenCalledTimes(1);
                                await expect(
                                    supervisor.whichChildren(ctx, pid)
                                ).resolves.toMatchPattern(t(ok, l()));
                            });
                        });
                    });
                    describe('with a transient restart', function () {
                        describe('due to an ignore response', function () {
                            let start;
                            let startIgnore;

                            beforeEach(function () {
                                node = new Node();
                                ctx = node.makeContext();
                                ctx.processFlag(trap_exit, true);
                                args = [];
                                start = jest.fn(Adder.startLink);
                                startIgnore = jest.fn(Ignored.startLink);
                                callbacks = {
                                    init: jest.fn(() => {
                                        return t(
                                            ok,
                                            t(
                                                {
                                                    strategy:
                                                        simple_one_for_one
                                                },
                                                l({
                                                    start: [startIgnore, []],
                                                    restart: transient
                                                })
                                            )
                                        );
                                    })
                                };
                            });

                            it('drops the child spec', async function () {
                                const [, pid] = await supervisor.startLink(
                                    ctx,
                                    callbacks
                                );

                                await supervisor.startChild(ctx, pid, l());
                                expect(startIgnore).toHaveBeenCalledTimes(1);
                                await expect(
                                    supervisor.whichChildren(ctx, pid)
                                ).resolves.toMatchPattern(t(ok, l()));
                            });
                        });
                    });
                    describe('due to an error', function () {});
                });
                describe('with transient restarts', function () {
                    let serverCallbacks;
                    beforeEach(function () {
                        serverCallbacks = {
                            init: jest.fn(() => {
                                return t(ok, null);
                            }),
                            handleCast: jest.fn((_ctx, _cast, state) => {
                                return t(stop, normal, state);
                            })
                        };
                        start = jest.fn((ctx, ...args) =>
                            gen_server.startLink(ctx, serverCallbacks, args)
                        );
                        callbacks = {
                            init: jest.fn(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: simple_one_for_one },
                                        l({
                                            start: [start, [1, 2, 3]],
                                            restart: transient
                                        })
                                    )
                                );
                            })
                        };
                    });
                    it('does not restart if the process stops normally', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        const response = supervisor.startChild(ctx, pid, l(1));
                        await expect(response).resolves.toMatchPattern(
                            t(ok, Pid.isPid)
                        );
                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).resolves.toMatchPattern(t(ok, l(_)));

                        const [, childPid] = await response;
                        gen_server.cast(ctx, childPid, 'stop');

                        await wait(100);
                        expect(serverCallbacks.handleCast).toHaveBeenCalled();

                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).resolves.toMatchPattern(t(ok, l()));
                    });
                });
                describe('startChild called', function () {
                    let start;
                    beforeEach(function () {
                        node = new Node();
                        ctx = node.makeContext();
                        ctx.processFlag(trap_exit, true);
                        args = [];
                        start = jest.fn(Adder.startLink);
                        callbacks = {
                            init: jest.fn(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: simple_one_for_one },
                                        l({
                                            start: [start, [1, 2, 3]],
                                            restart: transient
                                        })
                                    )
                                );
                            })
                        };
                    });

                    it('starts a process with the initialized spec', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );

                        const startChildPromiseA = supervisor.startChild(
                            ctx,
                            pid,
                            l()
                        );
                        await expect(
                            startChildPromiseA
                        ).resolves.toMatchPattern(t(ok, Pid.isPid));

                        const [, child] = await startChildPromiseA;
                        await expect(
                            gen_server.call(ctx, child, 'get')
                        ).resolves.toBe(6);
                    });

                    it('appends the passed arguments to the specification args', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );

                        const startChildPromiseA = supervisor.startChild(
                            ctx,
                            pid,
                            l(4, 5, 6)
                        );
                        await expect(
                            startChildPromiseA
                        ).resolves.toMatchPattern(t(ok, Pid.isPid));

                        const [, child] = await startChildPromiseA;
                        await expect(
                            gen_server.call(ctx, child, 'get')
                        ).resolves.toBe(21);
                    });
                });
            });
        });
    });
});
