/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';

import * as OTP from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { Pid, t } from '@otpjs/types';
import * as proc_lib from '../lib/index.js';

Error.stackTraceLimit = Infinity;
const { ok, trap_exit, EXIT } = OTP.Symbols;
const { _ } = matching.Symbols;

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

afterEach(function() {
    sinon.restore();
})

describe('ProcLib', function() {
    let node = null;
    let ctx = null;
    let pid = null;

    beforeEach(function() {
        node = new OTP.Node();
        ctx = node.makeContext();
        pid = ctx.self();
    });

    it('can start processes', async function() {
        expect(proc_lib).to.have.property('start');
        expect(proc_lib.start).to.be.an.instanceOf(Function);

        const result = await proc_lib.start(ctx, async (ctx, spawner) => {
            proc_lib.initAck(ctx, spawner, t(ok, ctx.self()));
            await ctx.receive();
        });

        expect(result).to.matchPattern(t(ok, Pid.isPid));

        const [, pid] = result;
        ctx.send(pid, 'stop');
    });

    it('can start and link processes', async function() {
        expect(proc_lib).to.have.property('startLink');
        expect(proc_lib.startLink).to.be.an.instanceOf(Function);

        ctx.processFlag(trap_exit, true);

        const result = await proc_lib.startLink(ctx, async (ctx, spawner) => {
            proc_lib.initAck(ctx, spawner, t(ok, ctx.self()));
        });

        expect(result).to.matchPattern(t(ok, Pid.isPid));

        const exitMessage = await ctx.receive();

        expect(exitMessage).to.matchPattern(t(EXIT, Pid.isPid, _));
    });
});
