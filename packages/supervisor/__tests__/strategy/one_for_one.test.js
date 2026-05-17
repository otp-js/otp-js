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
import * as Subtracter from '../subtracter.js';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { error, ok, trap_exit, kill, badarg } = Symbols;
const { _, spread } = matching.Symbols;
const { one_for_one, transient, temporary, cannot_start, max_retries } =
    supervisor.Symbols;

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

        await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));

        const [, pid] = await response;

        await expect(supervisor.countChildren(ctx, pid)).to.eventually.equal(2);
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

        const [, children] = await supervisor.whichChildren(ctx, pid);

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

        const [, nextChildren] = await supervisor.whichChildren(ctx, pid);
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
                const [, pid] = await supervisor.startLink(ctx, callbacks);

                const startChildPromiseA = supervisor.startChild(ctx, pid, {
                    id: 'b',
                    start: [start, [1, 2, 3]],
                    restart: transient,
                });
                await expect(startChildPromiseA).to.eventually.matchPattern(
                    t(ok, Pid.isPid)
                );

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
                                start: [Failed.startLink, [1, 2, 3]],
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
                                start: [Failed.startLink, [1, 2, 3]],
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
                                start: [Failed.startLink, [1, 2, 3]],
                                restart: transient,
                            })
                        ).to.eventually.matchPattern(
                            t(error, t(cannot_start, 'b', max_retries))
                        );
                    });
                });
                describe('from an OTPError', function () {
                    let pid;
                    beforeEach(async function () {
                        start = sinon.spy(Failed.startLink);
                        callbacks.init = sinon.spy(() => {
                            return t(ok, t({ strategy: one_for_one }, l()));
                        });

                        const [, started] = await supervisor.startLink(
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
                            t(error, t(cannot_start, 'a', max_retries))
                        );
                    });
                });
            });
        });
    });
});
