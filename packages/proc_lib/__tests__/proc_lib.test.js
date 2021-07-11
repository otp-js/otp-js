import * as OTP from '@otpjs/core';
import * as ProcLib from '../src';

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
        expect(ProcLib).toHaveProperty('start');
        expect(ProcLib.start).toBeInstanceOf(Function);

        const result = await ProcLib.start(
            ctx,
            async (ctx, spawner) => {
                await ProcLib.initAck(
                    ctx,
                    spawner,
                    {
                        ok: true,
                        pid: ctx.self()
                    }
                );
                await ctx.receive();
            }
        );

        expect(result).toBeInstanceOf(Object);
        expect(result.ok).toBe(true);
        expect(result.pid).toBeInstanceOf(OTP.Pid);

        ctx.send(result.pid, 'stop');
    });

    it('can start and link processes', async function() {
        expect(ProcLib).toHaveProperty('startLink');
        expect(ProcLib.startLink).toBeInstanceOf(Function);

        const { ok, pid } = await ProcLib.startLink(ctx, async (ctx, spawner) => {
            await ProcLib.initAck(
                ctx,
                spawner,
                {
                    ok: true,
                    pid: ctx.self()
                }
            );
        });

        expect(ok).toBe(true);
        expect(pid).toBeInstanceOf(OTP.Pid);

        const exitMessage = await ctx.receive();

        expect(exitMessage).toBeInstanceOf(Object);
        expect(exitMessage.exit).toBe(true);
        expect(exitMessage.pid).toBeInstanceOf(OTP.Pid);
        expect(exitMessage.pid).toBe(pid);
    })
})
