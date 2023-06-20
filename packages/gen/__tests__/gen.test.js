/* eslint-env jest */
import '@otpjs/test_utils';
import * as otp from '@otpjs/core';
import * as gen from '../src';
import * as proc_lib from '@otpjs/proc_lib';
import { Tuple, t, Pid, Ref, OTPError } from '@otpjs/types';
import crypto from 'crypto';

const { ok, kill, error, normal, badarg, nodedown, timeout } = otp.Symbols;
const { already_started, link, nolink, monitor, $gen_call, $gen_cast } =
    gen.Symbols;

let node;
let ctxServer;
let ctxClient;

function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(function () {
    node = new otp.Node();
    ctxServer = node.makeContext();
    ctxClient = node.makeContext();
});

afterEach(function () {
    node = null;
    ctxServer.exit(normal);
    ctxClient.exit(normal);
});

describe('start', function () {
    describe('without a name', function () {
        it('will succeed', async function () {
            const init = jest.fn((ctx, caller) => {
                proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
            });

            await expect(
                gen.start(ctxClient, nolink, undefined, init)
            ).resolves.toMatchPattern(t(ok, Pid.isPid));
        });
    });
    describe('with a name', function () {
        describe('that is not already registered', function () {
            it('will succeed', async function () {
                const init = jest.fn((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
                const name = Symbol.for('registered_name');

                await expect(
                    gen.start(ctxClient, nolink, t('local', name), init, {})
                ).resolves.toMatchPattern(t(ok, Pid.isPid));
            });
        });
        describe('that is already registered', function () {
            it('will fail', async function () {
                const init = jest.fn(() => ok);
                const name = Symbol.for('registered_name');
                await ctxServer.register(name);
                await expect(
                    gen.start(ctxClient, nolink, t('local', name), init, {})
                ).resolves.toMatchPattern(
                    t(error, t(already_started, ctxServer.self()))
                );
            });
        });
        describe('that is being started elsewhere', function () {
            it('only allows one to start', async function () {
                const init = jest.fn(async (ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                    await ctx.receive();
                });
                const name = Symbol.for('registered_name');

                const startA = gen.start(
                    ctxClient,
                    nolink,
                    t('local', name),
                    init,
                    {}
                );
                const startB = gen.start(
                    ctxServer,
                    nolink,
                    t('local', name),
                    init,
                    {}
                );

                const [responseA, responseB] = await Promise.all([
                    startA,
                    startB
                ]);
                expect(responseA).toMatchPattern(t(ok, Pid.isPid));
                const [, pid] = responseA;
                expect(responseB).toMatchPattern(
                    t(error, t(already_started, pid))
                );
            });
        });
    });
    describe('with linking style', function () {
        describe('nolink', function () {
            let init;
            beforeEach(function () {
                init = jest.fn((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            it('calls proc_lib.start', async function () {
                const start = jest.spyOn(proc_lib, 'start');
                const response = await gen.start(
                    ctxClient,
                    nolink,
                    undefined,
                    init,
                    {}
                );

                expect(start).toHaveBeenCalledTimes(1);
                expect(response).toMatchPattern(t(ok, Pid.isPid));
            });
            describe('with a timeout', function () {
                it('rejects if the timeout expires', async function () {
                    const spawnLimit = 300;
                    const init = jest.fn((_ctx, _caller) => ok);
                    await expect(
                        gen.start(
                            ctxClient,
                            nolink,
                            undefined,
                            init,
                            { timeout: spawnLimit }
                        )
                    ).rejects.toThrowTerm(timeout);
                });
            });
        });
        describe('link', function () {
            let init;
            beforeEach(function () {
                init = jest.fn((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            it('calls proc_lib.startLink', async function () {
                const startLink = jest.spyOn(proc_lib, 'startLink');
                const response = await gen.start(
                    ctxClient,
                    link,
                    undefined,
                    init,
                    {}
                );

                expect(startLink).toHaveBeenCalledTimes(1);
                expect(response).toMatchPattern(t(ok, Pid.isPid));
            });
            describe('with a timeout', function () {
                it('rejects if the timeout expires', async function () {
                    const spawnLimit = 300;
                    const init = jest.fn((ctx, _caller) => ctx.receive());
                    await expect(
                        gen.start(
                            ctxClient,
                            link,
                            undefined,
                            init,
                            { timeout: spawnLimit }
                        )
                    ).rejects.toThrowTerm(timeout);
                });
            });
        });
        describe('unknown', function () {
            let init;
            beforeEach(function () {
                init = jest.fn((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            it('treats it like nolink', async function () {
                const start = jest.spyOn(proc_lib, 'start');
                start.mockClear();

                const badLinkingStyle = Symbol();
                const response = await gen.start(
                    ctxClient,
                    badLinkingStyle,
                    undefined,
                    init,
                    {}
                );
                expect(start).toHaveBeenCalledTimes(1);
                expect(response).toMatchPattern(t(ok, Pid.isPid));
            });
        });
    });
});
describe('reply', function () {
    it('sends response to pid for the call identified by ref', async function () {
        const ref = ctxClient.ref();
        const from = t(ctxClient.self(), ref);
        const response = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        expect(function () {
            gen.reply(from, response);
        }).toThrow();
        expect(function () {
            gen.reply(ctxServer, from, response);
        }).not.toThrow();
        await expect(ctxClient.receive()).resolves.toMatchPattern(
            t(ref, response)
        );
    });
});
describe('unregisterName', function () {
    describe('with a pid', function () {
        it('returns ok', function () {
            const ctx = node.makeContext();
            expect(gen.unregisterName(ctx.self())).toBe(ok);
        });
    });
    describe('with a local name tuple', function () {
        let name;
        let tuple;
        beforeEach(function () {
            name = Symbol();
            tuple = t('local', name);
        });
        describe('when the name is registered', function () {
            let ctx;
            beforeEach(function () {
                ctx = node.makeContext();
                ctx.register(name);
            });
            it('returns ok', function () {
                const ctx = node.makeContext();
                expect(gen.unregisterName(ctx, tuple)).toBe(ok);
            });
            it('removes the registration', function () {
                const ctx = node.makeContext();
                expect(ctx.whereis(name)).toMatchPattern(Pid.isPid);
                gen.unregisterName(ctx, tuple);
                expect(ctx.whereis(name)).toBeUndefined();
            });
        });
    });
});
describe('call', function () {
    describe('to a dead local pid', function () {
        let ctx;
        let normalDeathPid;
        let abnormalDeathPid;

        beforeEach(async function () {
            ctx = node.makeContext();

            const normalDeathCtx = node.makeContext();
            normalDeathPid = normalDeathCtx.self();
            normalDeathCtx.die(normal);

            const abnormalDeathCtx = node.makeContext();
            abnormalDeathPid = abnormalDeathCtx.self();
            abnormalDeathCtx.die(badarg);

            await wait();
        });

        it('throws a OTPError with the down reason', async function () {
            await expect(
                gen.call(ctx, normalDeathPid, t('command', 0))
            ).rejects.toThrowTerm('noproc');
            await expect(
                gen.call(ctx, abnormalDeathPid, t('command', 0))
            ).rejects.toThrowTerm('noproc');
        });
    });
    describe('to a living local pid', function () {
        let ctx;
        let receiver;
        let pid;

        beforeEach(function () {
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('signals the receiving pid', async function () {
            const payload = crypto.randomInt(0xffffffff);
            const callPromise = gen.call(ctx, pid, payload);
            const message = await receiver.receive();

            expect(message).toBeInstanceOf(Tuple);
            const [tag, from, receivedPayload] = message;
            expect(tag).toBe($gen_call);
            expect(from).toBeInstanceOf(Tuple);
            const [fromPid, fromRef] = from;
            expect(fromPid).toBeInstanceOf(Pid);
            expect(Pid.compare(ctx.self(), fromPid)).toBe(0);
            expect(fromRef).toBeInstanceOf(Ref);
            expect(receivedPayload).toBe(payload);

            gen.reply(receiver, from, ok);
        });
    });
    describe('to a local name', function () {
        describe('which is registered', function () {
            let ctx;
            let receiver;
            let name;

            beforeEach(function () {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
            });

            it('signals the receiving pid', async function () {
                const payload = crypto.randomInt(0xffffffff);
                const callPromise = gen.call(ctx, name, payload);
                const message = await receiver.receive();

                expect(message).toBeInstanceOf(Tuple);
                const [tag, from, receivedPayload] = message;
                expect(tag).toBe($gen_call);
                expect(from).toBeInstanceOf(Tuple);
                const [fromPid, fromRef] = from;
                expect(fromPid).toBeInstanceOf(Pid);
                expect(Pid.compare(ctx.self(), fromPid)).toBe(0);
                expect(fromRef).toBeInstanceOf(Ref);
                expect(receivedPayload).toBe(payload);

                gen.reply(receiver, from, ok);
            });
        });
        describe('which is not registered', function () {
            let ctx;
            let receiver;
            let name;

            beforeEach(function () {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
            });

            it('throws a OTPError with the down reason', async function () {
                expect(function () {
                    gen.call(ctx, name, t('command', 0));
                }).toThrowTerm('noproc');
            });
        });
    });
    describe('to a name/node pair', function () {
        describe('to a visible node', function () {
            let ctx;
            let receiver;
            let target;

            beforeEach(function () {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
                target = t(name, node.name);
            });

            it('signals the receiving pid', async function () {
                const payload = crypto.randomInt(0xffffffff);
                const callPromise = gen.call(ctx, target, payload);
                const message = await receiver.receive();

                expect(message).toBeInstanceOf(Tuple);
                const [tag, from, receivedPayload] = message;
                expect(tag).toBe($gen_call);
                expect(from).toBeInstanceOf(Tuple);
                const [fromPid, fromRef] = from;
                expect(fromPid).toBeInstanceOf(Pid);
                expect(Pid.compare(ctx.self(), fromPid)).toBe(0);
                expect(fromRef).toBeInstanceOf(Ref);
                expect(receivedPayload).toBe(payload);

                gen.reply(receiver, from, ok);
            });
        });
        describe('to an unknown node', function () {
            let ctx;
            let target;
            let nodeName;

            beforeEach(function () {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                nodeName = Symbol.for('noone@nowhere');
                target = t(name, nodeName);
            });

            it('generates a nodedown EXIT signal', async function () {
                const signal = jest.spyOn(node, 'signal');
                const payload = crypto.randomInt(0xffffffff);
                let error;

                expect(function () {
                    try {
                        gen.call(ctx, target, payload);
                    } catch (err) {
                        error = err;
                        throw error;
                    }
                }).toThrow();

                expect(error).toBeInstanceOf(OTPError);
                expect(error.term).toBeInstanceOf(Tuple);
                const tuple = error.term;
                expect(tuple[0]).toBe(nodedown);
                expect(tuple[1]).toBe(nodeName);
            });
        });
    });
    describe('to something unrecognized', function () {
        let ctx;
        let target;

        beforeEach(function () {
            ctx = node.makeContext();
            target = 0;
        });

        it('throws a OTPError with the down reason', async function () {
            expect(function () {
                gen.call(ctx, target, t('command', 0));
            }).toThrowTerm('not_implemented');
        });
    });
    describe('when timed out', function () {
        let timeout;
        let ctx;
        let receiver;
        let pid;

        beforeEach(function () {
            timeout = 300;
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('throws a timeout error', async function () {
            await expect(
                gen.call(
                    ctx,
                    pid,
                    crypto.randomInt(0xffffffff),
                    timeout
                )
            ).rejects.toThrowTerm(otp.Symbols.timeout);
        });
    });
});
describe('cast', function () {
    describe('to a dead local pid', function () {
        let ctx;
        let normalDeathPid;
        let abnormalDeathPid;

        beforeEach(function () {
            ctx = node.makeContext();

            const normalDeathCtx = node.makeContext();
            normalDeathPid = normalDeathCtx.self();
            normalDeathCtx.die(normal);

            const abnormalDeathCtx = node.makeContext();
            abnormalDeathPid = abnormalDeathCtx.self();
            abnormalDeathCtx.die(badarg);
        });

        it('throws a OTPError with the down reason', async function () {
            expect(gen.cast(ctx, normalDeathPid, t('command', 0))).toBe(ok);
            expect(gen.cast(ctx, abnormalDeathPid, t('command', 0))).toBe(ok);
        });
    });
    describe('to a living local pid', function () {
        let ctx;
        let receiver;
        let pid;

        beforeEach(function () {
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('signals the receiving pid', async function () {
            const payload = crypto.randomInt(0xffffffff);
            gen.cast(ctx, pid, payload);
            const message = await receiver.receive();

            expect(message).toBeInstanceOf(Tuple);
            const [tag, receivedPayload] = message;
            expect(tag).toBe($gen_cast);
            expect(receivedPayload).toBe(payload);
        });
    });
    describe('to a local name', function () {
        describe('which is registered', function () {
            let ctx;
            let receiver;
            let name;

            beforeEach(function () {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
            });

            it('signals the receiving pid', async function () {
                const payload = crypto.randomInt(0xffffffff);
                const castResult = gen.cast(ctx, name, payload);
                const message = await receiver.receive();

                expect(message).toBeInstanceOf(Tuple);
                const [tag, receivedPayload] = message;
                expect(tag).toBe($gen_cast);
                expect(receivedPayload).toBe(payload);
            });
        });
        describe('which is not registered', function () {
            let ctx;
            let receiver;
            let name;

            beforeEach(function () {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
            });

            it('throws a OTPError with the down reason', async function () {
                expect(function () {
                    gen.cast(ctx, name, t('command', 0));
                }).toThrowTerm('noproc');
            });
        });
    });
    describe('to a name/node pair', function () {
        describe('to a visible node', function () {
            let ctx;
            let receiver;
            let target;

            beforeEach(function () {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
                target = t(name, node.name);
            });

            it('signals the receiving pid', async function () {
                const payload = crypto.randomInt(0xffffffff);
                const castPromise = gen.cast(ctx, target, payload);
                const message = await receiver.receive();

                expect(message).toBeInstanceOf(Tuple);
                const [tag, receivedPayload] = message;
                expect(tag).toBe($gen_cast);
                expect(receivedPayload).toBe(payload);
            });
        });
        describe('to an unknown node', function () {
            let ctx;
            let target;
            let nodeName;

            beforeEach(function () {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                nodeName = Symbol.for('noone@nowhere');
                target = t(name, nodeName);
            });

            it('generates a nodedown EXIT signal', async function () {
                const signal = jest.spyOn(node, 'signal');
                const payload = crypto.randomInt(0xffffffff);
                let error;

                expect(function () {
                    try {
                        gen.cast(ctx, target, payload);
                    } catch (err) {
                        error = err;
                        throw error;
                    }
                }).toThrow();

                expect(error).toBeInstanceOf(OTPError);
                expect(error.term).toBeInstanceOf(Tuple);
                const tuple = error.term;
                expect(tuple[0]).toBe(nodedown);
                expect(tuple[1]).toBe(nodeName);
            });
        });
    });
    describe('to something unrecognized', function () {
        let ctx;
        let target;

        beforeEach(function () {
            ctx = node.makeContext();
            target = 0;
        });

        it('throws a OTPError with the down reason', async function () {
            expect(function () {
                gen.cast(ctx, target, t('command', 0));
            }).toThrowTerm('not_implemented');
        });
    });
});
