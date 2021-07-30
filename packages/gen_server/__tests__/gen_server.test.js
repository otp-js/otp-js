import { caseOf, Node, OTPError, Pid, Symbols } from '@otpjs/core';
import '@otpjs/test_utils';
import debug from 'debug';
import * as GenServer from '../src';

const { error, EXIT, trap_exit } = Symbols;

const log = debug('otpjs:gen_server:__tests__');

const { ok, _, error, EXIT, trap_exit } = Symbols;
const { reply, noreply, stop } = GenServer.Symbols;

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function init(ctx) {
    const state = null;
    return [ok, state];
}

function handleCall(ctx, message, from, state) {
    const compare = caseOf(message)
    if (compare(['set', _])) {
        const [_command, value] = message;
        return [reply, ok, value];
    } else if (compare('get')) {
        return [reply, state, state];
    } else {
        throw new OTPError('invalid_call')
    }
}

function handleCast(ctx, command, state) {
    const compare = caseOf(command);
    if (compare(['set', _])) {
        const [, value] = command;
        return [noreply, value];
    } else {
        throw new OTPError('invalid_cast')
    }
}

function handleInfo(ctx, command, state) {
    const ok = true;

    const compare = caseOf(command);
    if (compare(['set', _])) {
        const [, value] = command;
        return [noreply, value];
    } else {
        throw new OTPError('invalid_info')
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
        ctx.processFlag(trap_exit, true);
    });

    it('starts a process', async function() {
        expect(GenServer.start).toBeInstanceOf(Function);

        expect(await GenServer.start(ctx, callbacks)).toMatchPattern([
            ok,
            Pid.isPid
        ])
    });

    it('can link on start', async function() {
        expect(GenServer.startLink).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.startLink(ctx, callbacks);
        expect(pid).toBeInstanceOf(Pid);
    });

    it('can be called', async function() {
        expect(GenServer.call).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        const resultA = await GenServer.call(
            ctx,
            pid,
            ['set', value]
        );

        log('resultA : %o', resultA);
        expect(resultA).toBe(ok);

        const resultB = await GenServer.call(
            ctx,
            pid,
            'get'
        );

        expect(resultB).toBe(value);
    });

    it('can receive casts', async function() {
        expect(GenServer.cast).toBeInstanceOf(Function);

        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await GenServer.cast(ctx, pid, ['set', value]);

        const result = await GenServer.call(ctx, pid, 'get');

        expect(result).toBe(value);
    });

    it('can receive arbitrary messages', async function() {
        const [_ok, pid] = await GenServer.start(ctx, callbacks);
        const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        await ctx.send(pid, ['set', value]);

        const result = await GenServer.call(ctx, pid, 'get');
        expect(result).toBe(value);
    });

    it('fails to start if the init callback errors', async function() {
        const response = await GenServer.start(
            ctx,
            {
                ...callbacks,
                init
            }
        );

        expect(response).toMatchPattern([
            error,
            _,
            'dying',
            _
        ]);

        function init(ctx) {
            throw new OTPError('dying');
        }
    });

    it('fails to start if the init callback indicates stopping', async function() {
        const response = await GenServer.start(
            ctx,
            {
                ...callbacks,
                init
            }
        );

        expect(response).toMatchPattern([
            error,
            _,
            'init_failed',
            _
        ]);

        function init(ctx) {
            const reason = 'init_failed';
            return [stop, reason];
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

        expect(response).toMatchPattern([
            error,
            _,
            'init_failed',
            _
        ])


        const message = await ctx.receive();
        expect(message).toMatchPattern([
            EXIT,
            _,
            'init_failed',
            _
        ]);

        function init(_ctx) {
            const reason = 'init_failed';
            throw Error(reason);
        }
    });

    let methods = [
        [
            'call',
            (ctx, pid, message) => expect(
                GenServer.call(ctx, pid, message, 50)
            ).rejects.toThrow('timeout')
        ],
        [
            'cast',
            (ctx, pid, message) => expect(
                GenServer.cast(
                    ctx,
                    pid,
                    message
                )
            ).resolves.toBe(ok)
        ],
        [
            'info',
            (ctx, pid, message) => ctx.send(
                pid,
                message
            )
        ],
    ]

    //it.only(`dies when the ${methods[0][0]} callback handler throws an error`, async function() {
    methods.forEach(
        ([type, method]) => it(`dies when the ${type} callback handler throws an error`, async function() {
            const [_ok, pid] = await GenServer.startLink(ctx, callbacks);
            const message = 'die';
            methods[0][1](ctx, pid, message);

            await wait(10);

            await expect(ctx.receive()).resolves.toMatchPattern([
                EXIT,
                pid,
                _,
                _
            ]);
        })
    );
}
