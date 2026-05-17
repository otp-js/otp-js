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

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { ok, trap_exit, kill } = Symbols;
const { _, spread } = matching.Symbols;
const { one_for_all, transient } = supervisor.Symbols;

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

describe('a one_for_all supervisor', function () {
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

        await expect(response).to.eventually.matchPattern(t(ok, Pid.isPid));

        const [, pid] = await response;

        await expect(supervisor.countChildren(ctx, pid)).to.eventually.equal(3);
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
        const [, [{ pid: pidA1 }, { pid: pidB1 }, { pid: pidC1 }]] = children;

        await ctx.exit(pidA1, kill);
        await wait(100);

        const nextChildren = await supervisor.whichChildren(ctx, pid);
        const [, [{ pid: pidA2 }, { pid: pidB2 }, { pid: pidC2 }]] =
            nextChildren;

        expect(pidA1).not.to.matchPattern(pidA2);
        expect(pidA2).to.matchPattern(Pid.isPid);

        expect(pidB1).not.to.matchPattern(pidB2);
        expect(pidB2).to.matchPattern(Pid.isPid);

        expect(pidC1).not.to.matchPattern(pidC2);
        expect(pidC2).to.matchPattern(Pid.isPid);
    });
    describe('deleteChild', function () {
        it('sends a delete_child call with the child id to be removed', async function () {
            await supervisor.deleteChild(ctx, pid, 'a');
        });
    });
});
