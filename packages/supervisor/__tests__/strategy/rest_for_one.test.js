/* eslint-env mocha */
import chaiMatching from '@otpjs/matching/chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';

import { Node, Pid, Symbols } from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { l, t } from '@otpjs/types';
import * as supervisor from '../../lib/index.js';
import * as Adder from '../adder.js';
import * as Failed from '../failed.js';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { ok, trap_exit, kill, EXIT } = Symbols;
const { _, spread } = matching.Symbols;
const { one_for_one, rest_for_one, transient, cannot_start, max_retries } =
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

describe('a rest_for_one supervisor', function () {
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

        await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));

        const [, pid] = await response;

        await expect(supervisor.countChildren(ctx, pid)).to.eventually.equal(5);
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
            const [, pid] = await supervisor.startLink(ctx, callbacks);
            const [, children] = await supervisor.whichChildren(ctx, pid);
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

            const [, nextChildren] = await supervisor.whichChildren(ctx, pid);
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
                                        start: [failRestart, [7, 8, 9]],
                                        restart: transient,
                                    }
                                )
                            )
                        );
                    }),
                };
            });

            it('terminates the supervisor', async function () {
                const [, pid] = await supervisor.startLink(ctx, callbacks);
                const [, children] = await supervisor.whichChildren(ctx, pid);

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
