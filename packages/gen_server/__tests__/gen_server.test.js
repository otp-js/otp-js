import { Node, Symbols } from '@otpjs/core';
import { caseOf } from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import '@otpjs/test_utils';
import * as GenServer from '../src';

function log(ctx, ...args) {
    const d = ctx.log.extend('gen_server:__tests__');
    return d(...args);
}
const { ok, _, spread, error, EXIT, trap_exit, normal } = Symbols;
const { reply, noreply, stop } = GenServer.Symbols;

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function init(ctx) {
    const state = null;
    return t(ok, state);
}

function handleCall(ctx, message, from, state) {
    const compare = caseOf(message);
    log(ctx, 'handleCall(%o)', message);
    if (compare(t('set', _))) {
        const [_command, value] = message;
        return t(reply, ok, value);
    } else if (compare('get')) {
        return t(reply, state, state);
    } else {
        throw new OTPError('invalid_call');
    }
}

function handleCast(ctx, command, state) {
    const compare = caseOf(command);
    if (compare(t('set', _))) {
        const [, value] = command;
        return t(noreply, value);
    } else {
        throw new OTPError('invalid_cast');
    }
}

function handleInfo(ctx, command, state) {
    const ok = true;

    const compare = caseOf(command);
    if (compare(t('set', _))) {
        const [, value] = command;
        return t(noreply, value);
    } else {
        throw new OTPError('invalid_info');
    }
}

const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo,
};

describe('GenServer', describeGenServer);

function describeGenServer() {
    let node = null;
    let ctx = null;
    let pid = null;

    beforeEach(function () {
        node = new Node();
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);
    });

    it('starts a process', async function () {
        expect(GenServer.start).toBeInstanceOf(Function);

        expect(await GenServer.start(ctx, callbacks)).toMatchPattern(
            t(ok, Pid.isPid)
        );
    });

    it('can link on start', async function () {
        expect(GenServer.startLink).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.startLink(ctx, callbacks);
        expect(pid).toBeInstanceOf(Pid);
    });

    it('can be called', async function () {
        expect(GenServer.call).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        const resultA = await GenServer.call(ctx, pid, t('set', value));

        log(ctx, 'resultA : %o', resultA);
        expect(resultA).toBe(ok);

        const resultB = await GenServer.call(ctx, pid, 'get');

        expect(resultB).toBe(value);
    });

    it('can receive casts', async function () {
        expect(GenServer.cast).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await GenServer.cast(ctx, pid, t('set', value));

        const result = await GenServer.call(ctx, pid, 'get');

        expect(result).toBe(value);
    });

    it('can receive arbitrary messages', async function () {
        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await ctx.send(pid, t('set', value));

        log(ctx, 'GenServer.call(%o, get)', pid);
        const result = await GenServer.call(ctx, pid, 'get');
        expect(result).toBe(value);
    });

    it('fails to start if the init callback errors', async function () {
        const response = await GenServer.start(ctx, {
            ...callbacks,
            init,
        });

        expect(response).toMatchPattern(
            t(error, { term: 'dying', [spread]: _ })
        );

        function init(ctx) {
            throw new OTPError('dying');
        }
    });

    it('fails to start if the init callback indicates stopping', async function () {
        const response = await GenServer.start(ctx, {
            ...callbacks,
            init,
        });

        expect(response).toMatchPattern(t(error, 'init_failed'));

        function init(ctx) {
            const reason = 'init_failed';
            return t(stop, reason);
        }
    });

    it('does not throw an error when stopped normally', async function () {
        const response = await GenServer.start(ctx, {
            ...callbacks,
            init,
        });

        expect(response).toMatchPattern(t(error, normal));

        function init(ctx) {
            const reason = normal;
            return t(stop, reason);
        }
    });

    it('sends an exit signal if the init callback fails', async function () {
        const response = await GenServer.startLink(ctx, {
            ...callbacks,
            init,
        });

        expect(response).toMatchPattern(
            t(error, {
                message: 'init_failed',
                [spread]: _,
            })
        );

        const message = await ctx.receive();
        expect(message).toMatchPattern(t(EXIT, _, 'init_failed', _));

        function init(_ctx) {
            const reason = 'init_failed';
            throw Error(reason);
        }
    });

    let methods = [
        [
            'call',
            (ctx, pid, message) => {
                log(ctx, 'call(%o, %o)', pid, message);
                return expect(
                    GenServer.call(ctx, pid, message, Infinity)
                ).rejects.toThrow('invalid_call');
            },
        ],
        [
            'cast',
            (ctx, pid, message) =>
                expect(GenServer.cast(ctx, pid, message)).resolves.toBe(ok),
        ],
        [
            'info',
            (ctx, pid, message) => expect(ctx.send(pid, message)).toBe(ok),
        ],
    ];

    // Use these if testing a single method instead of the foreach wrapper
    // const methodName = methods[0][0];
    // const method = methods[0][1];
    // it.only(`dies when the ${methodName} callback handler throws an error`, async function() {
    methods.forEach(([type, method]) =>
        it(`dies when the ${type} callback handler throws an error`, async function () {
            const [, pid] = await GenServer.startLink(ctx, callbacks);

            await wait(100);

            const message = 'die';
            await method(ctx, pid, message);

            await wait(100);

            await expect(ctx.receive()).resolves.toMatchPattern(
                t(EXIT, pid, _, _)
            );
        })
    );
    // Above line goes away when testing single method
}
