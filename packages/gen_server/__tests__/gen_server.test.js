/* eslint-env mocha */
import patternMatching from '@otpjs/matching/chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import crypto from 'crypto';
import { Node, Symbols } from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { OTPError, Pid, t, l } from '@otpjs/types';
import * as gen_server from '../lib/index.js';

chai.use(patternMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

function log(ctx, ...args) {
    const d = ctx.log.extend('gen_server:__tests__');
    return d(...args);
}
const { ok, error, EXIT, trap_exit, normal, timeout } = Symbols;
const { _, spread } = matching.Symbols;
const { reply, noreply, stop } = gen_server.Symbols;
const stop_ignore = Symbol.for('stop_ignore');

const WAIT_MS = 50;

async function wait(ms = WAIT_MS) {
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
    } else if (compare(t('error', _))) {
        const [, reason] = message;
        throw Error(reason);
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
    } else if (compare(t('error', _))) {
        const [, message] = command;
        throw Error(message);
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
    } else if (compare(t('error', _))) {
        const [, message] = command;
        throw Error(message);
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

    beforeEach(function () {
        node = new Node();
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);
    });

    describe('during startup', function () {
        it('returns the tuple {ok, Pid}', async function () {
            expect(gen_server.start).to.be.an.instanceOf(Function);

            expect(await gen_server.start(ctx, callbacks)).to.matchPattern(
                t(ok, Pid.isPid)
            );
        });
        it('can be linked', async function () {
            expect(gen_server.startLink).to.be.an.instanceOf(Function);

            const [_ok, pid] = await gen_server.startLink(ctx, callbacks);
            expect(pid).to.be.an.instanceOf(Pid);
        });

        it('fails if the init callback errors', async function () {
            const response = await gen_server.start(ctx, {
                ...callbacks,
                init,
            });

            expect(response).to.matchPattern(
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

            expect(response).to.matchPattern(t(error, 'init_failed'));

            function init(ctx) {
                const reason = 'init_failed';
                return t(stop, reason);
            }
        });

        it('fails if the init callback returns an unhandled response', async function () {
            const response = gen_server.start(ctx, { ...callbacks, init });
            expect(response).to.eventually.matchPattern(
                t(error, { term: 'invalid_init_response', [spread]: _ })
            );
            function init(ctx) {
                return l('pumpernickel', 'bread');
            }
        });

        it('sends an exit signal if the init callback fails', async function () {
            let resolvePid;
            const promisedPid = new Promise(
                (resolve) => (resolvePid = resolve)
            );
            const response = await gen_server.startLink(ctx, {
                ...callbacks,
                init,
            });

            expect(response).to.matchPattern(
                t(error, {
                    term: 'init_failed',
                    [spread]: _,
                })
            );

            const pid = await promisedPid;
            const message = await ctx.receive();
            expect(message).to.matchPattern(
                t(EXIT, pid, t(error, 'init_failed'))
            );

            function init(ctx) {
                resolvePid(ctx.self());
                const reason = 'init_failed';
                throw Error(reason);
            }
        });
    });
    describe('through messaging', function () {
        it('receives calls', async function () {
            expect(gen_server.call).to.be.an.instanceOf(Function);

            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const resultA = await gen_server.call(ctx, pid, t('set', value));

            log(ctx, 'resultA : %o', resultA);
            expect(resultA).to.equal(ok);

            const resultB = await gen_server.call(ctx, pid, 'get');

            expect(resultB).to.equal(value);
        });

        it('receives casts', async function () {
            expect(gen_server.cast).to.be.an.instanceOf(Function);

            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

            await gen_server.cast(ctx, pid, t('set', value));

            const result = await gen_server.call(ctx, pid, 'get');

            expect(result).to.equal(value);
        });

        it('receives arbitrary messages', async function () {
            const [_ok, pid] = await gen_server.start(ctx, callbacks);
            const value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

            await ctx.send(pid, t('set', value));

            log(ctx, 'GenServer.call(%o, get)', pid);
            const result = await gen_server.call(ctx, pid, 'get');
            expect(result).to.equal(value);
        });
    });
    describe('when reacting to messages', function () {
        it('does not throw an error if stopped normally', async function () {
            const response = await gen_server.start(ctx, {
                ...callbacks,
                init,
            });

            expect(response).to.matchPattern(t(error, normal));

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

            await expect(ctx.receive()).to.eventually.matchPattern(
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
                    const handleInfo = sinon.spy((ctx, info, state) => {
                        expect(info).to.matchPattern(
                            t(EXIT, Pid.isPid, reason)
                        );
                        return t(noreply, state);
                    });
                    const init = sinon.spy(async (ctx) => {
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
                    expect(handleInfo).to.have.been.called;
                });
            });
            describe('without trap_exit', function () {});
        });
        describe('its response patterns', function () {
            describe('when handling a call', function () {
                describe('given a reply with a timeout', function () {
                    let handleCall;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCall = sinon.spy((_ctx, _call, _from, state) =>
                            t(
                                reply,
                                'call reply',
                                state,
                                Math.floor(WAIT_MS / 2)
                            )
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('sends the reply to the caller', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call')
                        ).to.eventually.matchPattern('call reply');
                        expect(handleCall).to.have.been.called;
                    });
                    it('sends itself a message when timeout expires', async function () {
                        await gen_server.call(ctx, server, 'call');
                        await wait(WAIT_MS);
                        expect(handleInfo).to.have.been.calledWithPattern(
                            _,
                            timeout,
                            _
                        );
                    });
                });
                describe('given a reply with no timeout', function () {
                    let handleCall;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCall = sinon.spy((_ctx, _call, _from, state) =>
                            t(reply, 'call reply', state)
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('sends the reply to the caller', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call')
                        ).to.eventually.matchPattern('call reply');
                        expect(handleCall).to.have.been.called;
                    });
                });
                describe('given noreply with no timeout', function () {
                    let handleCall;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCall = sinon.spy((_ctx, _call, _from, state) =>
                            t(noreply, state)
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('waits for the next message', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'without', 100)
                        ).to.be.rejectedWithTerm(timeout);
                        expect(handleCall).to.have.been.called;
                        expect(handleInfo).not.to.have.been.called;
                    });
                });
                describe('given noreply with a timeout', function () {
                    let handleCall;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCall = sinon.spy((_ctx, _call, _from, state) =>
                            t(noreply, state, Math.floor(WAIT_MS))
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('waits for the next message', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'without', 100)
                        ).to.be.rejectedWithTerm(timeout);
                        expect(handleCall).to.have.been.called;
                    });
                    it('sends itself a message when timeout expires', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call', 100)
                        ).to.be.rejectedWithTerm(timeout);
                        await wait(200);
                        expect(handleInfo).to.have.been.calledWithPattern(
                            _,
                            timeout,
                            _
                        );
                    });
                });
                describe('given stop with a reply', function () {
                    let handleCall;
                    let handleInfo;
                    let handleTerminate;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCall = sinon.spy((_ctx, _call, _from, state) =>
                            t(stop, normal, 'call reply', state)
                        );
                        handleTerminate = sinon.spy(
                            (_ctx, _reason, _state) => ok
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                            server.onTerminate(handleTerminate);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        serverCtx.processFlag(trap_exit, true);
                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('sends the reply to the caller', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call')
                        ).to.eventually.matchPattern('call reply');
                        expect(handleCall).to.have.been.called;
                    });
                    it('terminates the server', async function () {
                        await gen_server.call(ctx, server, 'call');
                        expect(handleCall).to.have.been.called;
                        await wait(WAIT_MS);
                        expect(handleTerminate).to.have.been.calledWithPattern(
                            _,
                            normal,
                            _
                        );
                    });
                });
                describe('throwing an Error instance', function () {
                    let handleCall;
                    let handleTerminate;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleCall = sinon.spy((_ctx, _call, _from, state) => {
                            throw Error('test error');
                        });
                        handleTerminate = sinon.spy(
                            (_ctx, _reason, _state) => ok
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCall(_, handleCall);
                            server.onInfo(_, handleInfo);
                            server.onTerminate(handleTerminate);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        serverCtx.processFlag(trap_exit, true);
                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('exits the caller for the same reason', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call', 500)
                        ).to.be.rejectedWithTerm('test error');
                        expect(handleCall).to.have.been.called;
                    });
                    it('terminates the server', async function () {
                        await expect(
                            gen_server.call(ctx, server, 'call', 500)
                        ).to.be.rejectedWithTerm(_);
                        expect(handleCall).to.have.been.called;
                        await wait(WAIT_MS);
                        expect(handleTerminate).to.have.been.calledWithPattern(
                            _,
                            'test error',
                            _
                        );
                    });
                });
            });
            describe('when handling a cast', function () {
                describe('given noreply with no timeout', function () {
                    let handleCast;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCast = sinon.spy((_ctx, _call, _from, state) =>
                            t(noreply, state)
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCast(_, handleCast);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('waits for the next message', async function () {
                        await expect(
                            gen_server.cast(ctx, server, 'without')
                        ).to.eventually.equal(ok);
                        await wait();
                        expect(handleCast).to.have.been.called;
                        expect(handleInfo).not.to.have.been.called;
                    });
                });
                describe('given noreply with a timeout', function () {
                    let handleCast;
                    let handleInfo;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCast = sinon.spy((_ctx, _call, state) =>
                            t(noreply, state, 100)
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCast(_, handleCast);
                            server.onInfo(_, handleInfo);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('waits for the next message', async function () {
                        await expect(
                            gen_server.cast(ctx, server, 'without', 100)
                        ).to.eventually.equal(ok);
                        await wait(200);
                        expect(handleCast).to.have.been.called;
                    });
                    it('sends itself a message when timeout expires', async function () {
                        await expect(
                            gen_server.cast(ctx, server, 'call', 100)
                        ).to.eventually.equal(ok);
                        await wait(200);
                        expect(handleInfo).to.have.been.calledWithPattern(
                            _,
                            timeout,
                            _
                        );
                    });
                });
                describe('given stop with no reply', function () {
                    let handleCast;
                    let handleInfo;
                    let handleTerminate;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleInfo = sinon.spy((_ctx, _info, state) =>
                            t(noreply, state)
                        );
                        handleCast = sinon.spy((_ctx, _call, state) =>
                            t(stop, normal, state)
                        );
                        handleTerminate = sinon.spy(
                            (_ctx, _reason, _state) => ok
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCast(_, handleCast);
                            server.onInfo(_, handleInfo);
                            server.onTerminate(handleTerminate);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        serverCtx.processFlag(trap_exit, true);
                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('terminates the server', async function () {
                        await gen_server.cast(ctx, server, 'cast');
                        await wait();
                        expect(handleCast).to.have.been.called;
                        await wait(WAIT_MS);
                        expect(handleTerminate).to.have.been.calledWithPattern(
                            _,
                            normal,
                            _
                        );
                    });
                });
                describe('throwing an Error instance', function () {
                    let handleCast;
                    let handleTerminate;
                    let callbacks;
                    let server;
                    let serverCtx;

                    beforeEach(async function () {
                        handleCast = sinon.spy((_ctx, _cast, _state) => {
                            throw Error('test error');
                        });
                        handleTerminate = sinon.spy(
                            (_ctx, _reason, _state) => ok
                        );
                        callbacks = gen_server.callbacks((server) => {
                            server.onCast(_, handleCast);
                            server.onInfo(_, handleInfo);
                            server.onTerminate(handleTerminate);
                        });

                        serverCtx = node.makeContext();
                        server = serverCtx.self();

                        serverCtx.processFlag(trap_exit, true);
                        gen_server.enterLoop(serverCtx, callbacks, {});
                    });

                    it('terminates the server', async function () {
                        await expect(
                            gen_server.cast(ctx, server, 'cast')
                        ).to.eventually.equal(ok);
                        await wait();
                        expect(handleCast).to.have.been.called;
                        await wait(WAIT_MS);
                        expect(handleTerminate).to.have.been.calledWithPattern(
                            _,
                            'test error',
                            _
                        );
                    });
                });
            });
        });
    });
    describe('when terminating', function () {
        describe('given a terminate callback', function () {
            describe('which throws an OTPError', function () {
                let ctx;
                let serverCtx;
                let handleCall;
                let terminate;
                let pid;
                beforeEach(function () {
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    serverCtx = node.makeContext();
                    handleCall = sinon.spy((_ctx, _message, _from, _state) => {
                        throw OTPError('bad call');
                    });
                    terminate = sinon.spy((_ctx, reason, _state) => {
                        log(serverCtx, 'terminate(reason: %o)', reason);
                        throw OTPError('bad terminate');
                    });

                    const callbacks = gen_server.callbacks((server) => {
                        server.onCall(handleCall);
                        server.onTerminate(terminate);
                    });

                    pid = serverCtx.self();
                    gen_server.enterLoop(serverCtx, callbacks, {});
                });

                it('exits with the termination error', async function () {
                    await expect(
                        gen_server.call(ctx, pid, 'fake')
                    ).to.be.rejectedWithTerm('bad terminate');
                    await wait(WAIT_MS);
                    expect(terminate).to.have.been.calledWithPattern(
                        _,
                        'bad call',
                        _
                    );
                    await expect(serverCtx.death).to.eventually.matchPattern({
                        term: 'bad terminate',
                        [spread]: _,
                    });
                });
            });
            describe('which throws an Error', function () {
                let ctx;
                let serverCtx;
                let handleCall;
                let terminate;
                let pid;
                beforeEach(function () {
                    ctx = node.makeContext();
                    ctx.processFlag(trap_exit, true);
                    serverCtx = node.makeContext();
                    handleCall = sinon.spy((_ctx, _message, _from, _state) => {
                        throw Error('bad call');
                    });
                    terminate = sinon.spy((_ctx, reason, _state) => {
                        log(serverCtx, 'terminate(reason: %o)', reason);
                        throw Error('bad terminate');
                    });

                    const callbacks = gen_server.callbacks((server) => {
                        server.onCall(handleCall);
                        server.onTerminate(terminate);
                    });

                    pid = serverCtx.self();
                    gen_server.enterLoop(serverCtx, callbacks, {});
                });

                it('exits with the termination error', async function () {
                    await expect(
                        gen_server.call(ctx, pid, 'fake')
                    ).to.be.rejectedWithTerm('bad terminate');
                    await wait(WAIT_MS);
                    expect(terminate).to.have.been.calledWithPattern(
                        _,
                        'bad call',
                        _
                    );
                    await expect(serverCtx.death).to.eventually.matchPattern({
                        term: 'bad terminate',
                        [spread]: _,
                    });
                });
            });
            it('invokes the callback and terminates the server', async function () {});
        });
    });

    const methods = [
        [
            'call',
            async (ctx, pid, message) => {
                log(ctx, 'call(%o, %o)', pid, message);

                if (message === 'die') {
                    await expect(
                        gen_server.call(ctx, pid, message, Infinity)
                    ).to.be.rejectedWithTerm('invalid_call');
                } else {
                    const [, reason] = message;
                    await expect(
                        gen_server.call(ctx, pid, message, Infinity)
                    ).to.be.rejectedWithTerm(String(reason));
                }
            },
        ],
        [
            'cast',
            (ctx, pid, message) =>
                expect(gen_server.cast(ctx, pid, message)).to.eventually.equal(
                    ok
                ),
        ],
        [
            'info',
            (ctx, pid, message) => expect(ctx.send(pid, message)).to.equal(ok),
        ],
    ];

    // Use these if testing a single method instead of the foreach wrapper
    // Don't forget about the line below that needs to be commented out too
    //const type = methods[0][0];
    //const method = methods[0][1];
    //it.only(`dies when the ${type} callback handler throws an error`, async function () {
    methods.forEach(([type, method]) => {
        it(`dies when the ${type} callback handler throws an OTPError`, async function () {
            const [, pid] = await gen_server.startLink(ctx, callbacks);

            const message = 'die';
            await method(ctx, pid, message);

            await wait(WAIT_MS);

            await expect(ctx.receive()).to.eventually.matchPattern(
                t(EXIT, pid, _)
            );
        });

        it(`dies when the ${type} callback handler throws an Error`, async function () {
            const [, pid] = await gen_server.startLink(ctx, callbacks);

            const reason = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const message = t('error', reason);
            await method(ctx, pid, message);

            await wait(WAIT_MS);

            await expect(ctx.receive()).to.eventually.matchPattern(
                t(EXIT, pid, _)
            );
        });
    });
    // Above line goes away when testing single method

    describe('callback builder', function () {
        it('calls the passed function', function () {
            const fn = sinon.spy();
            gen_server.callbacks(fn);
            expect(fn).to.have.been.called;
        });
        it('receives an object of helper methods', function () {
            const fn = sinon.spy();
            gen_server.callbacks(fn);
            expect(fn.getCall(0).args[0]).to.be.an.instanceOf(Object);

            const server = fn.getCall(0).args[0];
            expect(server).to.have.property('onInit');
            expect(server).to.have.property('onCall');
            expect(server).to.have.property('onCast');
            expect(server).to.have.property('onInfo');
            expect(server).to.have.property('onTerminate');
        });
        it('produces a server callback interface', function () {
            const init = sinon.spy((_ctx) => t(ok, {}));
            const calls = sinon.spy((_ctx, _call, _from, state) =>
                t(noreply, state)
            );
            const casts = sinon.spy((_ctx, _cast, state) => t(noreply, state));
            const info = sinon.spy((_ctx, _info, state) => t(noreply, state));
            const terminate = sinon.spy((_ctx, _reason, _state) => ok);
            const fn = sinon.spy(function (server) {
                server.onInit(init);
                server.onCall(_, calls);
                server.onCast(_, casts);
                server.onInfo(_, info);
                server.onTerminate(terminate);
            });

            const callbacks = gen_server.callbacks(fn);
            expect(callbacks).to.be.an.instanceOf(Object);
            expect(callbacks).to.have.property('init');
            expect(callbacks).to.have.property('handleCall');
            expect(callbacks).to.have.property('handleInfo');
            expect(callbacks).to.have.property('handleCast');
            expect(callbacks).to.have.property('terminate');
        });

        describe('when started', function () {
            describe('given the arguments', function () {
                describe('ctx, name, and callbacks', function () {
                    it('registers the server under that name', async function () {
                        const name = Symbol.for('test_server');
                        const args = l();
                        const startPromise = gen_server.start(
                            ctx,
                            t('local', name),
                            callbacks,
                            args
                        );

                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );

                        const [, pid] = await startPromise;
                        expect(ctx.whereis(name)).to.matchPattern(pid);
                    });
                });
                describe('ctx, name, callbacks, and args', function () {
                    it('registers the server under that name', async function () {
                        const name = Symbol.for('test_server');
                        const startPromise = gen_server.start(
                            ctx,
                            t('local', name),
                            callbacks
                        );

                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );

                        const [, pid] = await startPromise;
                        expect(ctx.whereis(name)).to.matchPattern(pid);
                    });
                });
                describe('ctx, callbacks, and args', function () {
                    it('starts the process', async function () {
                        const args = l(1, 2, 3);
                        const startPromise = gen_server.start(
                            ctx,
                            callbacks,
                            args
                        );

                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );
                    });
                });
                describe('ctx and callbacks', function () {
                    it('starts the process', async function () {
                        const startPromise = gen_server.start(ctx, callbacks);

                        await expect(startPromise).to.eventually.matchPattern(
                            t(ok, Pid.isPid)
                        );
                    });
                });
                describe('ctx only', function () {
                    it('fails horribly', async function () {
                        await expect(
                            gen_server.start(ctx)
                        ).to.eventually.matchPattern(t(error, _));
                    });
                });
                describe('ctx and an explicit undefined', function () {
                    it('fails horribly', async function () {
                        await expect(
                            gen_server.start(ctx, undefined)
                        ).to.eventually.matchPattern(t(error, _));
                    });
                });
            });
            it('it calls the init callback provided', async function () {
                const init = sinon.spy((ctx) => t(ok, {}));
                const callbacks = gen_server.callbacks((server) => {
                    server.onInit(init);
                });

                const arg = crypto.randomInt(0xffffffff);
                const [, pid] = await gen_server.start(ctx, callbacks, l(arg));
                expect(init).to.have.callCount(1);
                expect(init.getCall(0).args[1]).to.equal(arg);
            });
            describe('init returns an ok response', function () {
                describe('uses signal handlers', function () {
                    let init;
                    beforeEach(function () {
                        init = sinon.spy((ctx, arg) => t(ok, { arg }));
                    });

                    describe('for calls', function () {
                        let onCallA;
                        let onCallB;
                        let onCallC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onCallA = sinon.spy((ctx, call, from, state) =>
                                t(reply, ok, state)
                            );
                            onCallB = sinon.spy((ctx, call, from, state) =>
                                t(reply, ok, state)
                            );
                            onCallC = sinon.spy((ctx, call, from, state) =>
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
                            ).to.eventually.equal(ok);
                            expect(onCallA).to.have.callCount(1);
                            expect(onCallB).to.have.callCount(0);
                            expect(onCallC).to.have.callCount(0);

                            await expect(
                                gen_server.call(ctx, server, t(0, 1))
                            ).to.eventually.equal(ok);
                            expect(onCallB).to.have.callCount(1);
                            expect(onCallC).to.have.callCount(0);

                            await expect(
                                gen_server.call(ctx, server, t(1, 1))
                            ).to.eventually.equal(ok);
                            expect(onCallC).to.have.callCount(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol('fake_call');
                            await expect(
                                gen_server.call(ctx, server, message)
                            ).to.be.rejectedWithTerm(
                                t('unhandled_call', message)
                            );
                            expect(ctx.processInfo(server)).to.be.undefined;
                        });
                    });
                    describe('for casts', function () {
                        let onCastA;
                        let onCastB;
                        let onCastC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onCastA = sinon.spy((ctx, cast, state) =>
                                t(noreply, state)
                            );
                            onCastB = sinon.spy((ctx, cast, state) =>
                                t(noreply, state)
                            );
                            onCastC = sinon.spy((ctx, cast, state) =>
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
                            ).to.eventually.equal(ok);
                            await wait();
                            expect(onCastA).to.have.callCount(1);
                            expect(onCastB).to.have.callCount(0);
                            expect(onCastC).to.have.callCount(0);

                            await expect(
                                gen_server.cast(ctx, server, t(0, 1))
                            ).to.eventually.equal(ok);
                            await wait();
                            expect(onCastB).to.have.callCount(1);
                            expect(onCastC).to.have.callCount(0);

                            await expect(
                                gen_server.cast(ctx, server, t(1, 1))
                            ).to.eventually.equal(ok);
                            await wait();
                            expect(onCastC).to.have.callCount(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol();
                            await expect(
                                gen_server.cast(ctx, server, message)
                            ).to.eventually.equal(ok);
                            await wait(10);
                            expect(ctx.processInfo(server)).to.be.undefined;
                        });
                    });
                    describe('for infos', function () {
                        let onInfoA;
                        let onInfoB;
                        let onInfoC;
                        let callbacks;
                        let server;
                        beforeEach(async function () {
                            onInfoA = sinon.spy((ctx, info, state) =>
                                t(noreply, state)
                            );
                            onInfoB = sinon.spy((ctx, info, state) =>
                                t(noreply, state)
                            );
                            onInfoC = sinon.spy((ctx, info, state) =>
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
                            expect(ctx.send(server, t(0, 0))).to.equal(ok);
                            await wait();
                            expect(onInfoA).to.have.callCount(1);
                            expect(onInfoB).to.have.callCount(0);
                            expect(onInfoC).to.have.callCount(0);

                            expect(ctx.send(server, t(0, 1))).to.equal(ok);
                            await wait();
                            expect(onInfoB).to.have.callCount(1);
                            expect(onInfoC).to.have.callCount(0);

                            expect(ctx.send(server, t(1, 1))).to.equal(ok);
                            await wait();
                            expect(onInfoC).to.have.callCount(1);
                        });

                        it('dies if no handler is found', async function () {
                            const message = Symbol();
                            expect(ctx.send(server, message)).to.equal(ok);
                            await wait(10);
                            expect(ctx.processInfo(server)).to.be.undefined;
                        });
                    });
                });
            });
            describe('init returns a stop response', function () {
                let init;
                let callbacks;
                beforeEach(function () {
                    init = sinon.spy((ctx, arg) => t(stop, arg));
                    callbacks = gen_server.callbacks((server) => {
                        server.onInit(init);
                    });
                });
                it('ends the process', async function () {
                    const reason = crypto.randomInt(0xffffffff);
                    await expect(
                        gen_server.start(ctx, callbacks, l(reason))
                    ).to.eventually.matchPattern(t(error, reason));
                });
            });
            describe('init returns an unknown response', function () {
                let init;
                let callbacks;
                beforeEach(function () {
                    init = sinon.spy((ctx, arg) => arg);
                    callbacks = gen_server.callbacks((server) => {
                        server.onInit(init);
                    });
                });
                it('ends the process', async function () {
                    await expect(
                        gen_server.start(ctx, callbacks, l())
                    ).to.eventually.matchPattern(
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
                    init = sinon.spy((ctx) => t(ok, {}));
                    onCast = sinon.spy((ctx, [, reason], state) =>
                        t(stop, reason, state)
                    );
                    onCall = sinon.spy((ctx, [, reason], state) =>
                        t(stop, reason, response, state)
                    );
                    onCallIgnore = sinon.spy((ctx, [, reason], state) =>
                        t(stop, reason, state)
                    );
                    terminate = sinon.spy((ctx, reason, state) => ok);

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
                    expect(terminate).to.have.callCount(1);
                    expect(terminate.getCall(0).args[1]).to.matchPattern(
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
                        ).to.eventually.equal(response);
                        await wait();
                        expect(terminate).to.have.callCount(1);
                        expect(terminate.getCall(0).args[1]).to.matchPattern(
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
                        callPromise.catch(() => ok);
                        await wait(0);
                        expect(terminate).to.have.callCount(1);
                        expect(terminate.getCall(0).args[1]).to.matchPattern(
                            t(error, reason)
                        );
                        await expect(callPromise).to.be.rejectedWithTerm(
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
                    init = sinon.spy((ctx) => t(ok, {}));
                    onCast = sinon.spy((ctx, [, reason], state) => reason);
                    terminate = sinon.spy((ctx, reason, state) => ok);

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
                    expect(terminate).to.have.callCount(1);
                    expect(terminate.getCall(0).args[1]).to.matchPattern(
                        t('bad_return_value', t(error, reason))
                    );
                });
            });
            describe('by exit signal', function () {});
        });
    });
}
