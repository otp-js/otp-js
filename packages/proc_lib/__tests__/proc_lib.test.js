import '@otpjs/test_utils';

import * as OTP from '@otpjs/core';
import { Pid } from '@otpjs/types';
import * as proc_lib from '../src';

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
            proc_lib.initAck(ctx, spawner, {
                ok: true,
                pid: ctx.self(),
            });
            await ctx.receive();
        });

        expect(result).toBeInstanceOf(Object);
        expect(result.ok).toBe(true);
        expect(result.pid).toBeInstanceOf(Pid);

        ctx.send(result.pid, 'stop');
    });

    it('can start and link processes', async function () {
        expect(proc_lib).toHaveProperty('startLink');
        expect(proc_lib.startLink).toBeInstanceOf(Function);

        ctx.processFlag(OTP.Symbols.trap_exit, true);

        const result = await proc_lib.startLink(ctx, async (ctx, spawner) => {
            proc_lib.initAck(ctx, spawner, [OTP.Symbols.ok, ctx.self()]);
        });

        expect(OTP.compare([OTP.Symbols.ok, Pid.isPid], result)).toBe(true);

        const exitMessage = await ctx.receive();

        expect(exitMessage).toMatchPattern([
            OTP.Symbols.EXIT,
            Pid.isPid,
            OTP.Symbols._,
            OTP.Symbols._,
        ]);
    });
});
