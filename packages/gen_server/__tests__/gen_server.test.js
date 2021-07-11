import debug from 'debug';
import { Node, Ref, Pid, Symbols } from '@otpjs/core';
import * as GenServer from '../src';

const log = debug('otp:gen_server:__tests__');

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function init(ctx) {
    const ok = true;
    const state = {};

    return { ok, state };
}

function handleCall(ctx, command, from, state) {
    const ok = true;

    switch (command.msg) {
        case 'set':
            return { ok, reply: ok, state: command.value };
        case 'get':
            return { ok, reply: state, state };
    }
}

function handleCast(ctx, command, state) {
    const ok = true;

    switch (command.msg) {
        case 'set':
            return { ok, state: command.value };
    }
}

function handleInfo(ctx, command, state) {
    const ok = true;

    switch (command.msg) {
        case 'set':
            return { ok, state: command.value };
    }
}

const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo
};

describe('GenServer', describeGenServer);

function describeGenServer() {
    let node = null;
    let ctx = null;
    let pid = null;

    beforeEach(function() {
        node = new Node();
        ctx = node.makeContext();
    });

    it('starts a process', async function() {
        expect(GenServer.start).toBeInstanceOf(Function);

        const { ok, pid } = await GenServer.start(ctx, callbacks);
        expect(ok).toBe(true);
        expect(pid).toBeInstanceOf(Pid);
    });

    it('can link on start', async function() {
        expect(GenServer.startLink).toBeInstanceOf(Function);

        const { ok, pid } = await GenServer.startLink(ctx, callbacks);
        expect(ok).toBe(true);
        expect(pid).toBeInstanceOf(Pid);
    });

    it(
        'can be called', async function() {
            expect(GenServer.call).toBeInstanceOf(Function);

            const { ok, pid } = await GenServer.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const resultA = await GenServer.call(
                ctx,
                pid,
                {
                    msg: 'set',
                    value,
                }
            );

            const resultB = await GenServer.call(
                ctx,
                pid,
                {
                    msg: 'get'
                }
            );

            expect(resultA).toBe(true);
            expect(resultB).toBe(value);
        });

    it('can receive casts', async function() {
        expect(GenServer.cast).toBeInstanceOf(Function);

        const { ok, pid } = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await GenServer.cast(ctx, pid, { msg: 'set', value });

        const result = await GenServer.call(ctx, pid, { msg: 'get' });

        expect(result).toBe(value);
    });

    it('can receive arbitrary messages', async function() {
        const { ok, pid } = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await ctx.send(pid, { msg: 'set', value });

        const result = await GenServer.call(ctx, pid, { msg: 'get' });
        expect(result).toBe(value);
    });

    it('fails to start if the init callback errors', async function() {
        const { ok, pid, error, reason } = await GenServer.start(
            ctx,
            {
                ...callbacks,
                init
            }
        );

        await wait(10);

        expect(ok).toBe(undefined);
        expect(pid).toBe(undefined);
        expect(error).toBe(true);
        expect(reason).toBe('dying');

        function init(ctx) {
            throw Error('dying');
        }
    });

    it('fails to start if the init callback indicates stopping', async function() {
        const { ok, pid, error, reason } = await GenServer.start(
            ctx,
            {
                ...callbacks,
                init
            }
        );

        expect(ok).toBe(undefined);
        expect(pid).toBe(undefined);
        expect(error).toBe(true);
        expect(reason).toBe('init_failed');

        function init(ctx) {
            const reason = 'init_failed';
            return {
                stop: true,
                reason
            };
        }
    });

    it('sends an exit signal if the init callback fails', async function() {
        const response = await GenServer.startLink(
            ctx,
            {
                ...callbacks,
                init
            }
        );
        const { ok, pid, error, reason } = response;


        expect(ok).toBe(undefined);
        expect(pid).toBe(undefined);
        expect(error).toBe(true);
        expect(reason).toBe('init_failed');

        const message = await ctx.receive();
        expect(message).toMatchObject({
            exit: true,
            reason: 'init_failed'
        });

        expect(GenServer.call(
            ctx,
            pid,
            {
                msg: 'get'
            },
            500
        )).rejects.toThrow('timeout');

        function init(_ctx) {
            const reason = 'init_failed';
            throw Error(reason);
        }
    });

    let methods = [
        [
            'call',
            (ctx, pid, message) => expect(
                GenServer.call(ctx, pid, message, 500)
            ).rejects.toThrow('timeout')
        ],
        [
            'cast',
            (ctx, pid, message) => GenServer.cast(
                ctx,
                pid,
                message
            )
        ],
        [
            'info',
            (ctx, pid, message) => ctx.send(
                pid,
                message
            )
        ],
    ]

    methods.forEach(
        ([type, method]) => it(`dies when the ${type} callback handler throws an error`, async function() {
            const { ok, pid } = await GenServer.startLink(ctx, callbacks);
            log('it dies when the %o... : pid : %o', type, pid);
            const message = { msg: 'die' };
            await method(ctx, pid, message);
            await expect(ctx.receive()).resolves.toMatchObject({
                exit: true,
                pid,
            })
        })
    );
}
