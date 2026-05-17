/* eslint-env mocha */
import chaiMatching from '@otpjs/matching/chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';

import { Node, Pid, Symbols } from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as matching from '@otpjs/matching';
import { l, t } from '@otpjs/types';
import * as supervisor from '../lib/index.js';
import * as Adder from './adder.js';
import * as Ignored from './ignored.js';

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
        let start;
        let startIgnore;
        let callbacks;
        let pid;
        beforeEach(async function () {
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
            [, pid] = await supervisor.startLink(ctx, callbacks, l());
        });

        describe('restartChild', function () {
            it('terminates and restarts the specified child', async function () {
                const [, children] = await supervisor.whichChildren(ctx, pid);
                const [target] = children;
                const { pid: childPid, id: childId } = target;
                let promise = supervisor.restartChild(ctx, pid, childId);
                await expect(promise).to.eventually.matchPattern(
                    t(ok, { pid: Pid.isPid, [spread]: _ })
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
        });
    });
});
