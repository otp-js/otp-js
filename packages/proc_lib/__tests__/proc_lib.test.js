import '@otpjs/test_utils';

import * as OTP from '@otpjs/core';
import { Pid, t, l } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import * as proc_lib from '../src';

Error.stackTraceLimit = Infinity;
const { ok, trap_exit, EXIT } = OTP.Symbols;
const { _ } = matching.Symbols;

describe('ProcLib', function () {
    let node = null;
    let ctx = null;
    let pid = null;

    beforeEach(function () {
        node = new OTP.Node();
        ctx = node.makeContext();
        pid = ctx.self();
    });

    it('can start processes', async function () {
        expect(proc_lib).toHaveProperty('start');
        expect(proc_lib.start).toBeInstanceOf(Function);

        const result = await proc_lib.start(ctx, async (ctx, spawner) => {
            proc_lib.initAck(ctx, spawner, t(ok, ctx.self()));
            await ctx.receive();
        });

        expect(result).toMatchPattern(t(ok, Pid.isPid));

        const [, pid] = result;
        ctx.send(pid, 'stop');
    });

    it('can start and link processes', async function () {
        expect(proc_lib).toHaveProperty('startLink');
        expect(proc_lib.startLink).toBeInstanceOf(Function);

        ctx.processFlag(trap_exit, true);

        const result = await proc_lib.startLink(ctx, async (ctx, spawner) => {
            proc_lib.initAck(ctx, spawner, t(ok, ctx.self()));
        });

        expect(result).toMatchPattern(t(ok, Pid.isPid));

        const exitMessage = await ctx.receive();

        expect(exitMessage).toMatchPattern(t(EXIT, Pid.isPid, _, _));
    });
});
