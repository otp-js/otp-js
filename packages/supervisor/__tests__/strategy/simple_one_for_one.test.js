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
import * as supervisor from '../../lib/index.js';
import * as Adder from '../adder.js';
import * as Failed from '../failed.js';
import * as Ignored from '../ignored.js';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { error, ok, trap_exit, normal, badarg } = Symbols;
const { _ } = matching.Symbols;
const {
    one_for_one,
    simple_one_for_one,
    transient,
    temporary,
    cannot_start,
    max_retries,
} = supervisor.Symbols;
const { stop } = gen_server.Symbols;

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

describe('a simple_one_for_one supervisor', function () {
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
        await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));

        const [, pid] = await response;

        await expect(supervisor.countChildren(ctx, pid)).to.eventually.equal(0);
        await expect(
            supervisor.whichChildren(ctx, pid)
        ).to.eventually.matchPattern(t(ok, l()));

        expect(start).not.to.have.been.called;
        expect(callbacks.init.getCall(0).returnValue).to.matchPattern(
            t(ok, t({ strategy: simple_one_for_one }, l.isList))
        );
    });
    it('spawns processes when startChild is called', async function () {
        const [, pid] = await supervisor.startLink(ctx, callbacks);
        for (let i = 0; i < 10; i++) {
            log(ctx, 'startChild(%o)', i);
            const response = supervisor.startChild(ctx, pid, l(i));

            await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));

            const [, child] = await response;

            expect(start).to.have.callCount(i + 1);
            expect(start.getCall(i).args[4]).to.matchPattern(i);
            await expect(
                start.getCall(i).returnValue
            ).to.eventually.matchPattern(t(ok, Pid.isPid));

            // Adder adds six by default, we have extended with i
            await expect(Adder.get(ctx, child)).to.eventually.matchPattern(
                i + 6
            );
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
                                        strategy: simple_one_for_one,
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
                    const [, pid] = await supervisor.startLink(ctx, callbacks);

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
                                        strategy: simple_one_for_one,
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
                    const [, pid] = await supervisor.startLink(ctx, callbacks);

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
                                        strategy: simple_one_for_one,
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
                    const [, pid] = await supervisor.startLink(ctx, callbacks);

                    await expect(
                        supervisor.startChild(ctx, pid, l(badarg))
                    ).to.eventually.matchPattern(
                        t(error, t(cannot_start, undefined, max_retries))
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
            const [, pid] = await supervisor.startLink(ctx, callbacks);
            const response = supervisor.startChild(ctx, pid, l(1));
            await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));
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
            const [, pid] = await supervisor.startLink(ctx, callbacks);
            const response = supervisor.startChild(ctx, pid, l(1));
            await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));
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
            await expect(which).to.eventually.matchPattern(t(ok, l(_)));
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
            const [, pid] = await supervisor.startLink(ctx, callbacks);

            const startChildPromiseA = supervisor.startChild(ctx, pid, l());
            await expect(startChildPromiseA).to.eventually.matchPattern(
                t(ok, Pid.isPid)
            );

            const [, child] = await startChildPromiseA;
            await expect(
                gen_server.call(ctx, child, 'get')
            ).to.eventually.equal(6);
        });

        it('appends the passed arguments to the specification args', async function () {
            const [, pid] = await supervisor.startLink(ctx, callbacks);

            const startChildPromiseA = supervisor.startChild(
                ctx,
                pid,
                l(4, 5, 6)
            );
            await expect(startChildPromiseA).to.eventually.matchPattern(
                t(ok, Pid.isPid)
            );

            const [, child] = await startChildPromiseA;
            await expect(
                gen_server.call(ctx, child, 'get')
            ).to.eventually.equal(21);
        });
    });
});
