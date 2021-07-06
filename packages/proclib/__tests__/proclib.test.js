import debug from 'debug';
import * as OTP from '@otpjs/core';

import * as ProcLib from '../src';

const log = debug('open-telecom:test:otp:ProcLib');

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

        log('start');
        const result = await ProcLib.start(ctx, async (ctx, spawner) => {
            log('initAck');
            ProcLib.initAck(ctx, spawner);
        });
        log('started : %o', result);

        expect(result).toBeInstanceOf(Object);
        expect(result.ok).toBe(true);
        expect(result.pid).toBeInstanceOf(OTP.Pid);
    });

    it('can start and link processes', async function() {
        expect(ProcLib).toHaveProperty('startLink');
        expect(ProcLib.startLink).toBeInstanceOf(Function);

        const { ok, pid } = await ProcLib.startLink(ctx, async (ctx, spawner) => {
            ProcLib.initAck(ctx, spawner);
        });

        const exitMessage = await ctx.receive();
        expect(exitMessage).toBeInstanceOf(Object);
        expect(exitMessage.exit).toBe(true);
        expect(exitMessage.pid).toBeInstanceOf(OTP.Pid);
        expect(exitMessage.pid).toBe(pid);
    })
})
