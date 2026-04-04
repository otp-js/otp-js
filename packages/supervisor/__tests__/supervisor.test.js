/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import * as util from 'node:util';

import { Node, Pid, Symbols } from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { l, t } from '@otpjs/types';
import * as supervisor from '../lib/index.js';
import * as Adder from './adder.js';
import * as Failed from './failed.js';
import * as Ignored from './ignored.js';
import * as Subtracter from './subtracter.js';
import { failed_to_start_child } from '#symbols';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { error, ok, trap_exit, normal, kill, badarg, timeout, EXIT } = Symbols;
const { _, spread } = matching.Symbols;
const {
    one_for_one,
    simple_one_for_one,
    one_for_all,
    rest_for_one,
    transient,
    temporary,
    cannot_start,
    max_retries,
    restart_child,
    delete_child,
    terminate_child,
} = supervisor.Symbols;
const { stop, reply } = gen_server.Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('supervisor:__tests__')(...args);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const { expect } = chai;

afterEach(function () {
    sinon.restore();
});

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
            init: sinon.spy(function () {
                return t(ok, t({ strategy: one_for_one }, l()));
            }),
        };
    });

    it('can start a linked process', async function () {
        expect(supervisor.startLink).to.be.an.instanceOf(Function);

        const pattern = t(ok, Pid.isPid);
        const start = supervisor.startLink(ctx, callbacks, args);
        await expect(start).to.eventually.matchPattern(pattern);
    });
    it('ignores unsupported calls', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks, args);
        await expect(
            gen_server.call(ctx, pid, 'nonsense', 100)
        ).to.be.rejectedWithTerm(timeout);
    });
    it('ignores unsupported casts', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks, args);
        await expect(gen_server.cast(ctx, pid, 'nonsense')).to.eventually.equal(
            ok
        );
        await wait(50);
        expect(ctx.processInfo(pid)).not.to.be.undefined;
    });
    it('ignores unsupported messages', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks, args);
        ctx.send(pid, 'nonsense');
        await wait(50);
        expect(ctx.processInfo(pid)).not.to.be.undefined;
    });

    describe('exports an api', function () {
        let callbacks;
        let handleCall;
        let pid;
        beforeEach(async function () {
            handleCall = sinon.stub();
            handleCall.returns(t(reply, ok, {}));
            callbacks = gen_server.callbacks((server) => {
                server.onInit(() => t(ok, {}));
                server.onCall(_, handleCall);
            });
            [, pid] = await gen_server.startLink(ctx, callbacks, l());
        });
        describe('terminateChild', function () {
            it('sends a terminate_child call with the child id to be terminated', async function () {
                await supervisor.terminateChild(ctx, pid, 'a');
                expect(handleCall).to.have.been.calledWithPattern(
                    _,
                    t(terminate_child, 'a'),
                    _,
                    _
                );
            });
        });
        describe('deleteChild', function () {
            it('sends a delete_child call with the child id to be removed', async function () {
                await supervisor.deleteChild(ctx, pid, 'a');
                expect(handleCall).to.have.been.calledWithPattern(
                    _,
                    t(delete_child, 'a'),
                    _,
                    _
                );
            });
        });
        describe('restartChild', function () {
            it('sends a restart_child call with the child id to be restarted', async function () {
                await supervisor.restartChild(ctx, pid, 'a');
                expect(handleCall).to.have.been.calledWithPattern(
                    _,
                    t(restart_child, 'a'),
                    _,
                    _
                );
            });
        });
    });
    describe('implements api methods', function () {
        const callbacks = {
            init: sinon.spy(() => {
                return t(
                    { strategy: one_for_one },
                    l(
                        {
                            id: 'a',
                            start: [start, [1, 2, 3]],
                            restart: transient,
                        },
                        {
                            id: 'b',
                            start: [start, [4, 5, 6]],
                            restart: transient,
                        },
                        {
                            id: 'c',
                            start: [startIgnore, []],
                            restart: transient,
                        },
                        {
                            id: 'd',
                            start: [start, [7, 8, 9]],
                            restart: transient,
                        },
                        {
                            id: 'e',
                            start: [start, [10, 11, 12]],
                            restart: transient,
                        }
                    )
                );
            }),
        };
        let pid;
        beforeEach(async function () {
            [, pid] = await supervisor.startLink(ctx, callbacks, l());
        });

        describe('restartChild', function () {
            it.only('terminates and restarts the specified child', async function () {
                const [, children] = await supervisor.whichChildren(ctx, pid);
                const [target] = children;
                const { pid: childPid, id: childId } = target;
                let promise = supervisor.restartChild(ctx, pid, childId);
                await expect(promise).to.eventually.matchPattern(
                    t(ok, Pid.isPid)
                );
                const [, nextChildPid] = await promise;
                expect(nextChildPid).not.to.matchPattern(childPid);
            });
        });
        describe('deleteChild', function () {});
        describe('terminateChild', function () {});
        describe('countChildren', function () {});
        describe('whichChildren', function () {});
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
                    expect(callbacks.init).to.have.been.called;
                });
                it('receives the arguments from the start call', async function () {
                    const arg1 = Math.random();
                    const arg2 = Symbol.for('$otp.supervisor.test_arg');
                    let received = null;
                    const callbacks = {
                        init: sinon.spy((ctx, ...args) => {
                            log(ctx, 'init(...%o)', args);
                            received = args;
                            return t(ok, null);
                        }),
                    };
                    const [, pid] = await supervisor.startLink(
                        ctx,
                        callbacks,
                        l(arg1, arg2)
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    expect(callbacks.init).to.have.been.called;

                    // use of spread operator means we'll capture this as an array
                    expect(received).to.matchPattern([arg1, arg2]);
                });
                it('may indicate to stop', async function () {
                    const callbacks = {
                        init: () => t(stop, badarg),
                    };

                    const startPromise = supervisor.startLink(ctx, callbacks);
                    await expect(startPromise).to.be.fulfilled;
                    await expect(startPromise).to.eventually.matchPattern(
                        t(error, badarg)
                    );
                });
                it('may fail to start correctly', async function () {
                    const callbacks = {
                        init: () => badarg,
                    };

                    const startPromise = supervisor.startLink(ctx, callbacks);
                    await expect(startPromise).to.be.fulfilled;
                    await expect(startPromise).to.eventually.matchPattern(
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
                        start = sinon.spy(Adder.startLink);
                        startIgnore = sinon.spy(Ignored.startLink);
                        callbacks = {
                            init: sinon.spy(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: one_for_one },
                                        l(
                                            {
                                                id: 'a',
                                                start: [start, [1, 2, 3]],
                                                restart: transient,
                                            },
                                            {
                                                id: 'b',
                                                start: [start, [4, 5, 6]],
                                                restart: transient,
                                            },
                                            {
                                                id: 'c',
                                                start: [startIgnore, []],
                                                restart: transient,
                                            },
                                            {
                                                id: 'd',
                                                start: [start, [7, 8, 9]],
                                                restart: transient,
                                            },
                                            {
                                                id: 'e',
                                                start: [start, [10, 11, 12]],
                                                restart: transient,
                                            }
                                        )
                                    )
                                );
                            }),
                        };
                    });

                    it('continues to start the remaining children', async function () {
                        const startPromise = supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        await expect(startPromise).to.be.fulfilled;
                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );
                        const [, pid] = await startPromise;

                        const living = { pid: Pid.isPid, [spread]: _ };
                        const dead = { pid: null, [spread]: _ };

                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).to.eventually.matchPattern(
                            t(ok, l(living, living, dead, living, living))
                        );
                    });

                    describe('from a temporary child', function () {
                        beforeEach(function () {
                            callbacks = {
                                init: sinon.spy(() => {
                                    return t(
                                        ok,
                                        t(
                                            { strategy: one_for_one },
                                            l(
                                                {
                                                    id: 'a',
                                                    start: [start, [1, 2, 3]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'b',
                                                    start: [start, [4, 5, 6]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'c',
                                                    start: [startIgnore, []],
                                                    restart: temporary,
                                                },
                                                {
                                                    id: 'd',
                                                    start: [start, [7, 8, 9]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'e',
                                                    start: [
                                                        start,
                                                        [10, 11, 12],
                                                    ],
                                                    restart: transient,
                                                }
                                            )
                                        )
                                    );
                                }),
                            };
                        });
                        it('removes the child spec', async function () {
                            const [, pid] = await supervisor.startLink(
                                ctx,
                                callbacks
                            );

                            await wait(50);

                            const living = { pid: Pid.isPid, [spread]: _ };
                            const dead = { pid: null, [spread]: _ };

                            await expect(
                                supervisor.whichChildren(ctx, pid)
                            ).to.eventually.matchPattern(
                                t(ok, l(living, living, living, living))
                            );
                        });
                    });
                });
                describe('due to an unrecognized response', function () {
                    let start;
                    let serverCallbacks;

                    beforeEach(function () {
                        node = new Node();
                        ctx = node.makeContext();
                        ctx.processFlag(trap_exit, true);
                        args = [];

                        serverCallbacks = gen_server.callbacks((server) => {
                            server.onInit((ctx) => {
                                throw OTPError('catastrophe');
                            });
                        });

                        start = sinon.spy((ctx) =>
                            gen_server.startLink(ctx, serverCallbacks, [])
                        );

                        callbacks = {
                            init: sinon.spy(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: one_for_all },
                                        l({
                                            id: 'process',
                                            start: [start, [10, 11, 12]],
                                            restart: transient,
                                        })
                                    )
                                );
                            }),
                        };
                    });

                    it('exits from a cannot_start error', async function () {
                        const startPromise = supervisor.startLink(
                            ctx,
                            callbacks
                        );

                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );

                        const [, pid] = await startPromise;
                        await expect(ctx.receive()).to.eventually.matchPattern(
                            t(EXIT, pid, {
                                term: t(cannot_start, 'process', max_retries),
                                [spread]: _,
                            })
                        );
                    });
                });
            });
            describe('for a one_for_one strategy', function () {
                let config = null;
                let callbacks = null;
                let adder = null;
                let subtracter = null;

                beforeEach(function () {
                    adder = sinon.spy(Adder.startLink);
                    subtracter = sinon.spy(Subtracter.startLink);
                    config = t(
                        {
                            strategy: one_for_one,
                        },
                        l(
                            {
                                id: 'adder',
                                start: [adder, [1, 2, 3]],
                                restart: transient,
                            },
                            {
                                id: 'subtracter',
                                start: [subtracter, [1, 2, 3]],
                                restart: transient,
                            }
                        )
                    );

                    callbacks = {
                        init: sinon.spy((ctx, ...args) => {
                            log(ctx, 'callbacks.init()');
                            return t(ok, config);
                        }),
                    };
                });

                it('spawns the processes defined by the initializer', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.to.throw();

                    await expect(response).to.eventually.matchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).to.eventually.equal(2);
                    await expect(
                        supervisor.whichChildren(ctx, pid)
                    ).to.eventually.matchPattern(
                        t(
                            ok,
                            l(
                                { id: 'adder', pid: Pid.isPid, [spread]: _ },
                                {
                                    id: 'subtracter',
                                    pid: Pid.isPid,
                                    [spread]: _,
                                }
                            )
                        )
                    );

                    node.exit(node.system, pid, kill);
                });
                it('restarts the processes when they die', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    log(ctx, 'spawned : %o', pid);

                    await wait(50);

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
                        expect(pid).to.be.an.instanceOf(Pid);
                        expect(node.processInfo(pid)).to.be.undefined;
                    }

                    const [, nextChildren] = await supervisor.whichChildren(
                        ctx,
                        pid
                    );
                    log(ctx, 'nextChildren: %o', nextChildren);
                    expect(nextChildren).to.matchPattern(
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
                        start = sinon.spy(Adder.startLink);
                        callbacks = {
                            init: sinon.spy(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: one_for_one },
                                        l({
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient,
                                        })
                                    )
                                );
                            }),
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
                                    restart: transient,
                                }
                            );
                            await expect(
                                startChildPromiseA
                            ).to.eventually.matchPattern(t(ok, Pid.isPid));

                            const [, child] = await startChildPromiseA;
                            await expect(
                                gen_server.call(ctx, child, 'get')
                            ).to.eventually.equal(6);

                            await expect(
                                supervisor.whichChildren(ctx, pid)
                            ).to.eventually.matchPattern(t(ok, l(_, _)));
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
                                                [1, 2, 3],
                                            ],
                                            restart: temporary,
                                        })
                                    ).to.eventually.matchPattern(t(error, _));
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
                                                [1, 2, 3],
                                            ],
                                            restart: temporary,
                                        })
                                    ).to.eventually.matchPattern(t(error, _));

                                    await expect(
                                        supervisor.whichChildren(ctx, pid)
                                    ).to.eventually.matchPattern(
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
                                                [1, 2, 3],
                                            ],
                                            restart: transient,
                                        })
                                    ).to.eventually.matchPattern(
                                        t(
                                            error,
                                            t(cannot_start, 'b', max_retries)
                                        )
                                    );
                                });
                            });
                            describe('from an OTPError', function () {
                                let pid;
                                beforeEach(async function () {
                                    start = sinon.spy(Failed.startLink);
                                    callbacks.init = sinon.spy(() => {
                                        return t(
                                            ok,
                                            t({ strategy: one_for_one }, l())
                                        );
                                    });

                                    const [, started] =
                                        await supervisor.startLink(
                                            ctx,
                                            callbacks
                                        );
                                    pid = started;
                                });
                                it('returns an error tuple', async function () {
                                    await expect(
                                        supervisor.startChild(ctx, pid, {
                                            id: 'a',
                                            start: [start, [badarg]],
                                            restart: transient,
                                        })
                                    ).to.eventually.matchPattern(
                                        t(
                                            error,
                                            t(cannot_start, 'a', max_retries)
                                        )
                                    );
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
                    start = sinon.spy(Adder.startLink);
                    callbacks = {
                        init: sinon.spy(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: one_for_all },
                                    l(
                                        {
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'b',
                                            start: [start, [4, 5, 6]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'c',
                                            start: [start, [7, 8, 9]],
                                            restart: transient,
                                        }
                                    )
                                )
                            );
                        }),
                    };
                });

                it('spawns all processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.to.throw();

                    await expect(response).to.eventually.matchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).to.eventually.equal(3);
                    expect(start).to.have.been.called;
                });
                it('spawns the processes declared by the init function', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const children = await supervisor.whichChildren(ctx, pid);

                    expect(children).to.matchPattern(
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

                    expect(pidA1).not.to.matchPattern(pidA2);
                    expect(pidA2).to.matchPattern(Pid.isPid);

                    expect(pidB1).not.to.matchPattern(pidB2);
                    expect(pidB2).to.matchPattern(Pid.isPid);

                    expect(pidC1).not.to.matchPattern(pidC2);
                    expect(pidC2).to.matchPattern(Pid.isPid);
                });
            });
            describe('for a rest_for_one strategy', function () {
                let start;
                beforeEach(function () {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = sinon.spy(Adder.startLink);
                    callbacks = {
                        init: sinon.spy(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: rest_for_one },
                                    l(
                                        {
                                            id: 'a',
                                            start: [start, [1, 2, 3]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'b',
                                            start: [start, [4, 5, 6]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'c',
                                            start: [start, [7, 8, 9]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'd',
                                            start: [start, [7, 8, 9]],
                                            restart: transient,
                                        },
                                        {
                                            id: 'e',
                                            start: [start, [7, 8, 9]],
                                            restart: transient,
                                        }
                                    )
                                )
                            );
                        }),
                    };
                });

                it('spawns all processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.to.throw();

                    await expect(response).to.eventually.matchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).to.eventually.equal(5);
                    expect(start).to.have.been.called;
                });
                it('spawns the processes declared by the init function', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    const children = await supervisor.whichChildren(ctx, pid);

                    expect(children).to.matchPattern(
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

                describe('when a child process dies', function () {
                    let failRestart;
                    it('restarts subsequent processes', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        const [, children] = await supervisor.whichChildren(
                            ctx,
                            pid
                        );
                        const [
                            { pid: pidA1 },
                            { pid: pidB1 },
                            { pid: pidC1 },
                            { pid: pidD1 },
                            { pid: pidE1 },
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
                            { pid: pidE2 },
                        ] = nextChildren;

                        log(ctx, 'NEXT_CHILDREN: %O', nextChildren);

                        expect(pidA1).to.matchPattern(pidA2);
                        expect(pidA2).to.matchPattern(Pid.isPid);

                        expect(pidB1).to.matchPattern(pidB2);
                        expect(pidB2).to.matchPattern(Pid.isPid);

                        expect(pidC1).not.to.matchPattern(pidC2);
                        expect(pidC2).to.matchPattern(Pid.isPid);

                        expect(pidD1).not.to.matchPattern(pidD2);
                        expect(pidD2).to.matchPattern(Pid.isPid);

                        expect(pidE1).not.to.matchPattern(pidE2);
                        expect(pidE2).to.matchPattern(Pid.isPid);
                    });
                    describe('and cannot be restarted', function () {
                        beforeEach(function () {
                            start = sinon.spy(Adder.startLink);
                            failRestart = sinon.stub();
                            failRestart.callsFake(Adder.startLink);

                            callbacks = {
                                init: sinon.spy(() => {
                                    return t(
                                        ok,
                                        t(
                                            { strategy: rest_for_one },
                                            l(
                                                {
                                                    id: 'a',
                                                    start: [start, [1, 2, 3]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'b',
                                                    start: [start, [4, 5, 6]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'c',
                                                    start: [start, [7, 8, 9]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'd',
                                                    start: [start, [7, 8, 9]],
                                                    restart: transient,
                                                },
                                                {
                                                    id: 'e',
                                                    start: [
                                                        failRestart,
                                                        [7, 8, 9],
                                                    ],
                                                    restart: transient,
                                                }
                                            )
                                        )
                                    );
                                }),
                            };
                        });

                        it('terminates the supervisor', async function () {
                            const [, pid] = await supervisor.startLink(
                                ctx,
                                callbacks
                            );
                            const [, children] = await supervisor.whichChildren(
                                ctx,
                                pid
                            );

                            expect(children.length()).to.equal(5);

                            failRestart.callsFake((ctx, ...args) => {
                                log(ctx, 'failRestart()');
                                return Failed.startLink(ctx, ...args);
                            });

                            const [child] = children;
                            log(ctx, 'test child: %o', child);
                            ctx.exit(child.pid, kill);

                            const received = await ctx.receive();
                            log(ctx, 'received: %o', received);
                            await expect(received).to.matchPattern(
                                t(EXIT, pid, {
                                    term: t(cannot_start, 'e', max_retries),
                                    [spread]: _,
                                })
                            );
                        });
                    });
                });
            });
            describe('for a simple_one_for_one strategy', function () {
                let start;
                beforeEach(function () {
                    node = new Node();
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    args = [];
                    start = sinon.spy(Adder.startLink);
                    callbacks = {
                        init: sinon.spy(() => {
                            return t(
                                ok,
                                t(
                                    { strategy: simple_one_for_one },
                                    l({
                                        start: [start, [1, 2, 3]],
                                        restart: transient,
                                    })
                                )
                            );
                        }),
                    };
                });
                it('spawns no processes after initializing', async function () {
                    let response;
                    expect(function () {
                        response = supervisor.startLink(ctx, callbacks);
                    }).not.to.throw();
                    await expect(response).to.eventually.matchPattern(
                        t(ok, Pid.isPid)
                    );

                    const [, pid] = await response;

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).to.eventually.equal(0);
                    await expect(
                        supervisor.whichChildren(ctx, pid)
                    ).to.eventually.matchPattern(t(ok, l()));

                    expect(start).not.to.have.been.called;
                    expect(
                        callbacks.init.getCall(0).returnValue
                    ).to.matchPattern(
                        t(ok, t({ strategy: simple_one_for_one }, l.isList))
                    );
                });
                it('spawns processes when startChild is called', async function () {
                    const [, pid] = await supervisor.startLink(ctx, callbacks);
                    for (let i = 0; i < 10; i++) {
                        log(ctx, 'startChild(%o)', i);
                        const response = supervisor.startChild(ctx, pid, l(i));

                        await expect(response).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );

                        const [, child] = await response;

                        expect(start).to.have.callCount(i + 1);
                        expect(start.getCall(i).args[4]).to.matchPattern(i);
                        await expect(
                            start.getCall(i).returnValue
                        ).to.eventually.matchPattern(t(ok, Pid.isPid));

                        // Adder adds six by default, we have extended with i
                        await expect(
                            Adder.get(ctx, child)
                        ).to.eventually.matchPattern(i + 6);
                    }

                    await expect(
                        supervisor.countChildren(ctx, pid)
                    ).to.eventually.matchPattern(10);
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
                                start = sinon.spy(Adder.startLink);
                                startIgnore = sinon.spy(Ignored.startLink);
                                callbacks = {
                                    init: sinon.spy(() => {
                                        return t(
                                            ok,
                                            t(
                                                {
                                                    strategy:
                                                        simple_one_for_one,
                                                },
                                                l({
                                                    start: [startIgnore, []],
                                                    restart: temporary,
                                                })
                                            )
                                        );
                                    }),
                                };
                            });

                            it('drops the child spec', async function () {
                                const [, pid] = await supervisor.startLink(
                                    ctx,
                                    callbacks
                                );

                                await supervisor.startChild(ctx, pid, l());
                                expect(startIgnore).to.have.callCount(1);
                                await expect(
                                    supervisor.whichChildren(ctx, pid)
                                ).to.eventually.matchPattern(t(ok, l()));
                            });
                        });
                    });
                    describe('with a transient restart', function () {
                        describe('due to an ignore response', function () {
                            let start;

                            beforeEach(function () {
                                node = new Node();
                                ctx = node.makeContext();
                                ctx.processFlag(trap_exit, true);
                                args = [];
                                start = sinon.spy(Ignored.startLink);
                                callbacks = {
                                    init: sinon.spy(() => {
                                        return t(
                                            ok,
                                            t(
                                                {
                                                    strategy:
                                                        simple_one_for_one,
                                                },
                                                l({
                                                    start: [start, []],
                                                    restart: transient,
                                                })
                                            )
                                        );
                                    }),
                                };
                            });

                            it('drops the child spec', async function () {
                                const [, pid] = await supervisor.startLink(
                                    ctx,
                                    callbacks
                                );

                                await supervisor.startChild(ctx, pid, l());
                                expect(start).to.have.callCount(1);
                                await expect(
                                    supervisor.whichChildren(ctx, pid)
                                ).to.eventually.matchPattern(t(ok, l()));
                            });
                        });
                        describe('due to an error', function () {
                            let start;

                            beforeEach(function () {
                                node = new Node();
                                ctx = node.makeContext();
                                ctx.processFlag(trap_exit, true);
                                args = [];
                                start = sinon.spy(Failed.startLink);
                                callbacks = {
                                    init: sinon.spy(() => {
                                        return t(
                                            ok,
                                            t(
                                                {
                                                    strategy:
                                                        simple_one_for_one,
                                                },
                                                l({
                                                    start: [start, []],
                                                    restart: transient,
                                                })
                                            )
                                        );
                                    }),
                                };
                            });

                            it('tries up to max_retries times', async function () {
                                const [, pid] = await supervisor.startLink(
                                    ctx,
                                    callbacks
                                );

                                await expect(
                                    supervisor.startChild(ctx, pid, l(badarg))
                                ).to.eventually.matchPattern(
                                    t(
                                        error,
                                        t(cannot_start, undefined, max_retries)
                                    )
                                );

                                expect(start).to.have.callCount(10);
                            });
                        });
                    });
                });
                describe('with transient restarts', function () {
                    let serverCallbacks;
                    let castHandler;
                    beforeEach(function () {
                        castHandler = sinon.spy((_ctx, [, reason], state) =>
                            t(stop, reason, state)
                        );
                        serverCallbacks = gen_server.callbacks((server) => {
                            server.onInit(() => t(ok, null));
                            server.onCast(t(stop, _), castHandler);
                        });
                        start = sinon.spy((ctx, ...args) =>
                            gen_server.startLink(ctx, serverCallbacks, args)
                        );
                        callbacks = {
                            init: sinon.spy(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: simple_one_for_one },
                                        l({
                                            start: [start, [1, 2, 3]],
                                            restart: transient,
                                        })
                                    )
                                );
                            }),
                        };
                    });
                    it('does not restart if the process stops normally', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        const response = supervisor.startChild(ctx, pid, l(1));
                        await expect(response).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );
                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).to.eventually.matchPattern(t(ok, l(_)));
                        expect(start).to.have.callCount(1);

                        sinon.reset();

                        const [, childPid] = await response;
                        gen_server.cast(ctx, childPid, t(stop, normal));

                        await wait(100);
                        expect(castHandler).to.have.been.called;

                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).to.eventually.matchPattern(t(ok, l()));
                        expect(start).not.to.have.been.called;
                    });
                    it('attempts restarts if the process stops abnormally', async function () {
                        const [, pid] = await supervisor.startLink(
                            ctx,
                            callbacks
                        );
                        const response = supervisor.startChild(ctx, pid, l(1));
                        await expect(response).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );
                        await expect(
                            supervisor.whichChildren(ctx, pid)
                        ).to.eventually.matchPattern(t(ok, l(_)));
                        expect(start).to.have.callCount(1);

                        sinon.reset();

                        const [, childPid] = await response;
                        gen_server.cast(ctx, childPid, t(stop, badarg));

                        await wait(100);
                        expect(castHandler).to.have.been.called;

                        const which = supervisor.whichChildren(ctx, pid);
                        await expect(which).to.eventually.matchPattern(
                            t(ok, l(_))
                        );
                        expect(start).to.have.been.called;

                        const [, { pid: nextPid }] = await which;
                        expect(childPid).not.to.matchPattern(nextPid);
                    });
                });
                describe('startChild called', function () {
                    let start;
                    beforeEach(function () {
                        node = new Node();
                        ctx = node.makeContext();
                        ctx.processFlag(trap_exit, true);
                        args = [];
                        start = sinon.spy(Adder.startLink);
                        callbacks = {
                            init: sinon.spy(() => {
                                return t(
                                    ok,
                                    t(
                                        { strategy: simple_one_for_one },
                                        l({
                                            start: [start, [1, 2, 3]],
                                            restart: transient,
                                        })
                                    )
                                );
                            }),
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
                        ).to.eventually.matchPattern(t(ok, Pid.isPid));

                        const [, child] = await startChildPromiseA;
                        await expect(
                            gen_server.call(ctx, child, 'get')
                        ).to.eventually.equal(6);
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
                        ).to.eventually.matchPattern(t(ok, Pid.isPid));

                        const [, child] = await startChildPromiseA;
                        await expect(
                            gen_server.call(ctx, child, 'get')
                        ).to.eventually.equal(21);
                    });
                });
            });
        });
    });
});
