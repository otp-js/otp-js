import { Node, Symbols } from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import '@otpjs/test_utils';
import * as gen_server from '../src';

function log(ctx, ...args) {
    const d = ctx.log.extend('gen_server:__tests__');
    return d(...args);
}
const { ok, error, EXIT, trap_exit, normal } = Symbols;
const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function init(ctx) {
    const state = null;
    return t(ok, state);
}

function handleCall(ctx, message, from, state) {
    const compare = matching.caseOf(message);
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
    const compare = matching.caseOf(command);
    if (compare(t('set', _))) {
        const [, value] = command;
        return t(noreply, value);
    } else {
        throw new OTPError('invalid_cast');
    }
}

function handleInfo(ctx, command, state) {
    const ok = true;

    const compare = matching.caseOf(command);
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

describe('gen_server', describeGenServer);

function describeGenServer() {
    let node = null;
    let ctx = null;
    let pid = null;

    beforeEach(function () {
        node = new Node();
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);
    });

    describe('during startup', function () {
        it('returns the tuple {ok, Pid}', async function () {
            expect(gen_server.start).toBeInstanceOf(Function);

            expect(await gen_server.start(ctx, callbacks)).toMatchPattern(
                t(ok, Pid.isPid)
            );
        });
        it('can be linked', async function () {
            expect(gen_server.startLink).toBeInstanceOf(Function);

            const [_ok, pid] = await gen_server.startLink(ctx, callbacks);
            expect(pid).toBeInstanceOf(Pid);
        });

        it('fails if the init callback errors', async function () {
            const response = await gen_server.start(ctx, {
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

        it('fails if the init callback indicates stopping', async function () {
            const response = await gen_server.start(ctx, {
                ...callbacks,
                init,
            });

            expect(response).toMatchPattern(t(error, 'init_failed'));

            function init(ctx) {
                const reason = 'init_failed';
                return t(stop, reason);
            }
        });

        it('fails if the init callback returns an unhandled response', async function () {
            const response = gen_server.start(ctx, { ...callbacks, init });
            expect(response).resolves.toMatchPattern(
                t(error, { term: 'invalid_init_response', [spread]: _ })
            );
            function init(ctx) {
                return l('pumpernickel', 'bread');
            }
        });

        it('sends an exit signal if the init callback fails', async function () {
            const response = await gen_server.startLink(ctx, {
                ...callbacks,
                init,
            });

            expect(response).toMatchPattern(
                t(error, {
                    term: 'init_failed',
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
    });
    describe('through messaging', function () {
        it('receives calls', async function () {
            expect(gen_server.call).toBeInstanceOf(Function);

            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const resultA = await gen_server.call(ctx, pid, t('set', value));

            log(ctx, 'resultA : %o', resultA);
            expect(resultA).toBe(ok);

            const resultB = await gen_server.call(ctx, pid, 'get');

            expect(resultB).toBe(value);
        });

        it('receives casts', async function () {
            expect(gen_server.cast).toBeInstanceOf(Function);

            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

            await gen_server.cast(ctx, pid, t('set', value));

            const result = await gen_server.call(ctx, pid, 'get');

            expect(result).toBe(value);
        });

        it('receives arbitrary messages', async function () {
            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

            await ctx.send(pid, t('set', value));

            log(ctx, 'GenServer.call(%o, get)', pid);
            const result = await gen_server.call(ctx, pid, 'get');
            expect(result).toBe(value);
        });
    });
    describe('when reacting to messages', function () {
        it('does not throw an error if stopped normally', async function () {
            const response = await gen_server.start(ctx, {
                ...callbacks,
                init,
            });

            expect(response).toMatchPattern(t(error, normal));

            function init(ctx) {
                const reason = normal;
                return t(stop, reason);
            }
        });
        it('throws an error if it responds abnormally', async function () {
            const [, pid] = await gen_server.startLink(ctx, {
                ...callbacks,
                handleCast,
            });

            gen_server.cast(ctx, pid, 'die');

            await expect(ctx.receive()).resolves.toMatchPattern(
                t(
                    EXIT,
                    pid,
                    { term: t('bad_return_value', l.isList), [spread]: _ },
                    _
                )
            );

            function handleCast(ctx, cast, state) {
                const reason = normal;
                return l('oogie', 'boogie');
            }
        });

        describe('like exit signals', function () {
            describe('with trap_exit', function () {
                it('receives the message via handleInfo', async function () {
                    const reason = Math.floor(
                        Math.random() * Number.MAX_SAFE_INTEGER
                    );
                    const handleInfo = jest.fn((ctx, info, state) => {
                        expect(info).toMatchPattern(
                            t(EXIT, Pid.isPid, reason, _)
                        );
                        return t(noreply, state);
                    });
                    const init = jest.fn(async (ctx) => {
                        ctx.processFlag(trap_exit, true);
                        const pid = ctx.spawnLink((ctx) => {
                            throw new OTPError(reason);
                        });
                        return t(ok, pid);
                    });
                    const [, pid] = await gen_server.startLink(ctx, {
                        ...callbacks,
                        init,
                        handleInfo,
                    });

                    await wait(50);
                    expect(handleInfo).toHaveBeenCalled();
                });
            });
            describe('without trap_exit', function () {});
        });
    });

    let methods = [
        [
            'call',
            (ctx, pid, message) => {
                log(ctx, 'call(%o, %o)', pid, message);
                return expect(
                    gen_server.call(ctx, pid, message, Infinity)
                ).rejects.toThrow('invalid_call');
            },
        ],
        [
            'cast',
            (ctx, pid, message) =>
                expect(gen_server.cast(ctx, pid, message)).resolves.toBe(ok),
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
            const [, pid] = await gen_server.startLink(ctx, callbacks);

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
