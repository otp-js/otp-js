import * as util from 'node:util';
import * as common from '#strategy/common';
import { cannot_start, max_retries, permanent } from '#symbols';
import * as gen_server from '@otpjs/gen_server';
import chaiMatching from '@otpjs/matching/chai';
import { _ } from '@otpjs/matching/symbols';
import { Node } from '@otpjs/node';
import { badarg, trap_exit } from '@otpjs/node/symbols';
import { l, OTPError, Pid, t } from '@otpjs/types';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

let node;
let ctx;

beforeEach(function () {
    node = new Node();
    ctx = node.makeContext();
    ctx.processFlag(trap_exit, true);
});

describe('startChildren', function () {
    describe('when a child fails to start', function () {
        it('rejects with an error', async function () {
            const callbacks = {
                init() {
                    throw new OTPError(badarg);
                },
            };
            const fail = sinon.spy((ctx) =>
                gen_server.startLink(ctx, callbacks, l())
            );
            const promise = common.startChildren(
                ctx,
                l({ id: 'a', start: [fail, []], restart: permanent })
            );
            await expect(promise).to.be.rejectedWithTerm(
                t(cannot_start, _, max_retries)
            );
        });
    });
});

describe('restartMultipleChildren', function () {
    describe('when a child fails to start', function () {});
});

describe('cleanup', function () {
    describe('given the index of a child', function () {
        it('removes the pid of said child', function () {
            const state = {
                children: l(
                    { id: 'a', pid: Pid.of(0, 0, 1) },
                    { id: 'b', pid: Pid.of(0, 0, 2) },
                    { id: 'c', pid: Pid.of(0, 0, 3) }
                ),
            };

            const [, stateA] = common.cleanup(ctx, state, 0);
            expect(stateA.children).to.matchPattern(
                l(
                    { id: 'a', pid: null },
                    { id: 'b', pid: Pid.of(0, 0, 2) },
                    { id: 'c', pid: Pid.of(0, 0, 3) }
                )
            );
            const [, stateB] = common.cleanup(ctx, state, 1);
            expect(stateB.children).to.matchPattern(
                l(
                    { id: 'a', pid: Pid.of(0, 0, 1) },
                    { id: 'b', pid: null },
                    { id: 'c', pid: Pid.of(0, 0, 3) }
                )
            );
            const [, stateC] = common.cleanup(ctx, stateB, 2);
            expect(stateC.children).to.matchPattern(
                l(
                    { id: 'a', pid: Pid.of(0, 0, 1) },
                    { id: 'b', pid: null },
                    { id: 'c', pid: null }
                )
            );
        });
    });
});
