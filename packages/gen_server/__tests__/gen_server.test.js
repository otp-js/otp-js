import crypto from 'crypto';
import { Node, Symbols } from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import '@otpjs/test_utils';
import * as gen_server from '../src';

function log(ctx, ...args) {
    const d = ctx.log.extend('gen_server:__tests__');
    return d(...args);
}
const { ok, error, EXIT, trap_exit, normal, timeout } = Symbols;
const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const stop_ignore = Symbol.for('stop_ignore');

async function wait(ms = 50) {
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
            let resolvePid;
            let promisedPid = new Promise((resolve) => (resolvePid = resolve));
            let response = await gen_server.startLink(ctx, {
                ...callbacks,
                init,
            });

            expect(response).toMatchPattern(
                t(error, {
                    term: 'init_failed',
                    [spread]: _,
                })
            );

            let pid = await promisedPid;
            let message = await ctx.receive();
            expect(message).toMatchPattern(t(EXIT, pid, 'init_failed'));

            function init(ctx) {
                resolvePid(ctx.self());
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
                t(EXIT, pid, {
                    term: t('bad_return_value', l.isList),
                    [spread]: _,
                })
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
                t(EXIT, pid, _)
            );
        })
    );
    // Above line goes away when testing single method

    describe('callback builder', function () {
        it('calls the passed function', function () {
            const fn = jest.fn();
            gen_server.callbacks(fn);
            expect(fn).toHaveBeenCalled();
        });
        it('receives an object of helper methods', function () {
            const fn = jest.fn();
            gen_server.callbacks(fn);
            expect(fn.mock.calls[0][0]).toBeInstanceOf(Object);

            const server = fn.mock.calls[0][0];
            expect(server).toHaveProperty('onInit');
            expect(server).toHaveProperty('onCall');
            expect(server).toHaveProperty('onCast');
            expect(server).toHaveProperty('onInfo');
            expect(server).toHaveProperty('onTerminate');
        });
        it('produces a server callback interface', function () {
            const init = jest.fn(() => t(ok, {}));
            const calls = jest.fn(() => t(noreply, state));
            const casts = jest.fn(() => t(noreply, state));
            const info = jest.fn(() => t(noreply, state));
            const terminate = jest.fn(() => ok);
            const fn = jest.fn(function (server) {
                server.onInit(init);
                server.onCall(_, calls);
                server.onCast(_, casts);
                server.onInfo(_, info);
                server.onTerminate(terminate);
            });

            const callbacks = gen_server.callbacks(fn);
            expect(callbacks).toBeInstanceOf(Object);
            expect(callbacks).toHaveProperty('init');
            expect(callbacks).toHaveProperty('handleCall');
            expect(callbacks).toHaveProperty('handleInfo');
            expect(callbacks).toHaveProperty('handleCast');
            expect(callbacks).toHaveProperty('terminate');
        });

        describe('when started', function () {
            it('it calls the init callback provided', async function () {
                const init = jest.fn((ctx) => t(ok, {}));
                const callbacks = gen_server.callbacks((server) => {
                    server.onInit(init);
                });

                const arg = crypto.randomInt(0xffffffff);
                const [, pid] = await gen_server.start(ctx, callbacks, l(arg));
                expect(init).toHaveBeenCalledTimes(1);
                expect(init.mock.calls[0][1]).toBe(arg);
            });
            describe('init returns an ok response', function () {
                describe('uses signal handlers', function () {
                    let init;
                    beforeEach(function () {
                        init = jest.fn((ctx, arg) => t(ok, { arg }));
                    });

                    describe('for calls', function () {
                        let onCallA;
                        let onCallB;
                        let onCallC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onCallA = jest.fn((ctx, call, from, state) =>
                                t(reply, ok, state)
                            );
                            onCallB = jest.fn((ctx, call, from, state) =>
                                t(reply, ok, state)
                            );
                            onCallC = jest.fn((ctx, call, from, state) =>
                                t(reply, ok, state)
                            );

                            callbacks = gen_server.callbacks((server) => {
                                server.onInit(init);
                                server.onCall(t(0, 0), onCallA);
                                server.onCall(t(0, _), onCallB);
                                server.onCall(t(_, _), onCallC);
                            });

                            const [, pid] = await gen_server.start(
                                ctx,
                                callbacks,
                                l(0)
                            );
                            server = pid;
                        });

                        it('uses the first matching handler', async function () {
                            await expect(
                                gen_server.call(ctx, server, t(0, 0))
                            ).resolves.toBe(ok);
                            expect(onCallA).toHaveBeenCalledTimes(1);
                            expect(onCallB).toHaveBeenCalledTimes(0);
                            expect(onCallC).toHaveBeenCalledTimes(0);

                            await expect(
                                gen_server.call(ctx, server, t(0, 1))
                            ).resolves.toBe(ok);
                            expect(onCallB).toHaveBeenCalledTimes(1);
                            expect(onCallC).toHaveBeenCalledTimes(0);

                            await expect(
                                gen_server.call(ctx, server, t(1, 1))
                            ).resolves.toBe(ok);
                            expect(onCallC).toHaveBeenCalledTimes(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol();
                            await expect(
                                gen_server.call(ctx, server, message)
                            ).rejects.toThrowTerm(t('unhandled_call', message));
                            expect(ctx.processInfo(server)).toBeUndefined();
                        });
                    });
                    describe('for casts', function () {
                        let onCastA;
                        let onCastB;
                        let onCastC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onCastA = jest.fn((ctx, cast, state) =>
                                t(noreply, state)
                            );
                            onCastB = jest.fn((ctx, cast, state) =>
                                t(noreply, state)
                            );
                            onCastC = jest.fn((ctx, cast, state) =>
                                t(noreply, state)
                            );

                            callbacks = gen_server.callbacks((server) => {
                                server.onInit(init);
                                server.onCast(t(0, 0), onCastA);
                                server.onCast(t(0, _), onCastB);
                                server.onCast(t(_, _), onCastC);
                            });

                            const [, pid] = await gen_server.start(
                                ctx,
                                callbacks,
                                l(0)
                            );
                            server = pid;
                        });

                        it('uses the first matching handler', async function () {
                            await expect(
                                gen_server.cast(ctx, server, t(0, 0))
                            ).resolves.toBe(ok);
                            await wait();
                            expect(onCastA).toHaveBeenCalledTimes(1);
                            expect(onCastB).toHaveBeenCalledTimes(0);
                            expect(onCastC).toHaveBeenCalledTimes(0);

                            await expect(
                                gen_server.cast(ctx, server, t(0, 1))
                            ).resolves.toBe(ok);
                            await wait();
                            expect(onCastB).toHaveBeenCalledTimes(1);
                            expect(onCastC).toHaveBeenCalledTimes(0);

                            await expect(
                                gen_server.cast(ctx, server, t(1, 1))
                            ).resolves.toBe(ok);
                            await wait();
                            expect(onCastC).toHaveBeenCalledTimes(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol();
                            await expect(
                                gen_server.cast(ctx, server, message)
                            ).resolves.toBe(ok);
                            await wait(10);
                            expect(ctx.processInfo(server)).toBeUndefined();
                        });
                    });
                    describe('for infos', function () {
                        let onInfoA;
                        let onInfoB;
                        let onInfoC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onInfoA = jest.fn((ctx, info, state) =>
                                t(noreply, state)
                            );
                            onInfoB = jest.fn((ctx, info, state) =>
                                t(noreply, state)
                            );
                            onInfoC = jest.fn((ctx, info, state) =>
                                t(noreply, state)
                            );

                            callbacks = gen_server.callbacks((server) => {
                                server.onInit(init);
                                server.onInfo(t(0, 0), onInfoA);
                                server.onInfo(t(0, _), onInfoB);
                                server.onInfo(t(_, _), onInfoC);
                            });

                            const [, pid] = await gen_server.start(
                                ctx,
                                callbacks,
                                l(0)
                            );
                            server = pid;
                        });

                        it('uses the first matching handler', async function () {
                            expect(ctx.send(server, t(0, 0))).toBe(ok);
                            await wait();
                            expect(onInfoA).toHaveBeenCalledTimes(1);
                            expect(onInfoB).toHaveBeenCalledTimes(0);
                            expect(onInfoC).toHaveBeenCalledTimes(0);

                            expect(ctx.send(server, t(0, 1))).toBe(ok);
                            await wait();
                            expect(onInfoB).toHaveBeenCalledTimes(1);
                            expect(onInfoC).toHaveBeenCalledTimes(0);

                            expect(ctx.send(server, t(1, 1))).toBe(ok);
                            await wait();
                            expect(onInfoC).toHaveBeenCalledTimes(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol();
                            expect(ctx.send(server, message)).toBe(ok);
                            await wait(10);
                            expect(ctx.processInfo(server)).toBeUndefined();
                        });
                    });
                });
            });
            describe('init returns a stop response', function () {
                let init;
                let callbacks;
                beforeEach(function () {
                    init = jest.fn((ctx, arg) => t(stop, arg));
                    callbacks = gen_server.callbacks((server) => {
                        server.onInit(init);
                    });
                });
                it('ends the process', async function () {
                    const reason = crypto.randomInt(0xffffffff);
                    await expect(
                        gen_server.start(ctx, callbacks, l(reason))
                    ).resolves.toMatchPattern(t(error, reason));
                });
            });
            describe('init returns an unknown response', function () {
                let init;
                let callbacks;
                beforeEach(function () {
                    init = jest.fn((ctx, arg) => arg);
                    callbacks = gen_server.callbacks((server) => {
                        server.onInit(init);
                    });
                });
                it('ends the process', async function () {
                    await expect(
                        gen_server.start(ctx, callbacks, l())
                    ).resolves.toMatchPattern(
                        t(error, { term: 'invalid_init_response', [spread]: _ })
                    );
                });
            });
        });
        describe('when stopped', function () {
            describe('by stop return', function () {
                let init;
                let onCast;
                let onCall;
                let onCallIgnore;
                let terminate;
                let server;
                let response;

                beforeEach(async function () {
                    response = crypto.randomInt(0xffffffff);
                    init = jest.fn((ctx) => t(ok, {}));
                    onCast = jest.fn((ctx, [, reason], state) =>
                        t(stop, reason, state)
                    );
                    onCall = jest.fn((ctx, [, reason], state) =>
                        t(stop, reason, response, state)
                    );
                    onCallIgnore = jest.fn((ctx, [, reason], state) =>
                        t(stop, reason, state)
                    );
                    terminate = jest.fn((ctx, reason, state) => ok);

                    const callbacks = gen_server.callbacks(function (server) {
                        server.onInit(init);
                        server.onCall(t(stop, _), onCall);
                        server.onCall(t(stop_ignore, _), onCallIgnore);
                        server.onCast(t(stop, _), onCast);
                        server.onTerminate(terminate);
                    });

                    const [, pid] = await gen_server.start(ctx, callbacks, l());
                    server = pid;
                });

                it('calls terminate', async function () {
                    const reason = crypto.randomInt(0xffffffff);
                    await gen_server.cast(
                        ctx,
                        server,
                        t(stop, t(error, reason))
                    );
                    await wait();
                    expect(terminate).toHaveBeenCalledTimes(1);
                    expect(terminate.mock.calls[0][1]).toMatchPattern(
                        t(error, reason)
                    );
                });
                describe('to a call', function () {
                    it('can respond to the call while doing so', async function () {
                        const reason = crypto.randomInt(0xffffffff);
                        await expect(
                            gen_server.call(
                                ctx,
                                server,
                                t(stop, t(error, reason))
                            )
                        ).resolves.toBe(response);
                        await wait();
                        expect(terminate).toHaveBeenCalledTimes(1);
                        expect(terminate.mock.calls[0][1]).toMatchPattern(
                            t(error, reason)
                        );
                    });
                    it('can choose not to respond to the call while doing so', async function () {
                        const reason = crypto.randomInt(0xffffffff);
                        const callPromise = gen_server.call(
                            ctx,
                            server,
                            t(stop_ignore, t(error, reason)),
                            500
                        );
                        await wait(0);
                        expect(terminate).toHaveBeenCalledTimes(1);
                        expect(terminate.mock.calls[0][1]).toMatchPattern(
                            t(error, reason)
                        );
                        await expect(callPromise).rejects.toThrowTerm(
                            t(error, reason)
                        );
                    });
                });
            });
            describe('by a bad response', function () {
                let init;
                let onCast;
                let terminate;
                let server;

                beforeEach(async function () {
                    init = jest.fn((ctx) => t(ok, {}));
                    onCast = jest.fn((ctx, [, reason], state) => reason);
                    terminate = jest.fn((ctx, reason, state) => ok);

                    const callbacks = gen_server.callbacks(function (server) {
                        server.onInit(init);
                        server.onCast(t(stop, _), onCast);
                        server.onTerminate(terminate);
                    });

                    const [, pid] = await gen_server.start(ctx, callbacks, l());
                    server = pid;
                });
                it('calls terminate', async function () {
                    const reason = crypto.randomInt(0xffffffff);
                    await gen_server.cast(
                        ctx,
                        server,
                        t(stop, t(error, reason))
                    );
                    await wait(10);
                    expect(terminate).toHaveBeenCalledTimes(1);
                    expect(terminate.mock.calls[0][1]).toMatchPattern(
                        t('bad_return_value', t(error, reason))
                    );
                });
            });
            describe('by exit signal', function () {});
        });
    });
}
