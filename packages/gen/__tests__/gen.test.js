/* eslint-env mocha */
import patternMatching from '@otpjs/matching/chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import * as otp from '@otpjs/node';
import * as gen from '../lib/index.js';
import * as proc_lib from '@otpjs/proc_lib';
import { Tuple, t, Pid, Ref, OTPError } from '@otpjs/types';
import crypto from 'crypto';

chai.use(patternMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

const { ok, kill, error, normal, badarg, nodedown, timeout } = otp.Symbols;
const { already_started, link, nolink, monitor, $gen_call, $gen_cast } =
    gen.Symbols;

let node;
let ctxServer;
let ctxClient;

function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(function() {
    node = new otp.Node();
    ctxServer = node.makeContext();
    ctxClient = node.makeContext();
});

afterEach(function() {
    node = null;
    ctxServer.exit(normal);
    ctxClient.exit(normal);
});

describe('start', function() {
    describe('without a name', function() {
        it('will succeed', async function() {
            const init = sinon.spy((ctx, caller) => {
                proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
            });

            await expect(
                gen.start(ctxClient, nolink, undefined, init)
            ).to.eventually.matchPattern(t(ok, Pid.isPid));
        });
    });
    describe('with a name', function() {
        describe('that is not already registered', function() {
            it('will succeed', async function() {
                const init = sinon.spy((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
                const name = Symbol.for('registered_name');

                await expect(
                    gen.start(ctxClient, nolink, t('local', name), init, {})
                ).to.eventually.matchPattern(t(ok, Pid.isPid));
            });
        });
        describe('that is already registered', function() {
            it('will fail', async function() {
                const init = sinon.spy(() => ok);
                const name = Symbol.for('registered_name');
                await ctxServer.register(name);
                await expect(
                    gen.start(ctxClient, nolink, t('local', name), init, {})
                ).to.eventually.matchPattern(
                    t(error, t(already_started, ctxServer.self()))
                );
            });
        });
        describe('that is being started elsewhere', function() {
            it('only allows one to start', async function() {
                const init = sinon.spy(async (ctx, caller) => {
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
                    startB,
                ]);

                expect(responseA).to.matchPattern(t(ok, Pid.isPid));
                const [, pid] = responseA;
                expect(responseB).to.matchPattern(
                    t(error, t(already_started, pid))
                );
            });
        });
        describe('that is not local', function() {
            it('will not fail', async function() {
                const init = sinon.spy((ctx, starter) =>
                    proc_lib.initAck(ctx, starter, t(ok, ctx.self()))
                );
                const name = Symbol.for('registered_name');
                await expect(
                    gen.start(
                        ctxClient,
                        nolink,
                        t('non-euclidean', name),
                        init,
                        {}
                    )
                ).to.eventually.matchPattern(t(ok, Pid.isPid));
            });
        });
    });
    describe('with linking style', function() {
        describe('nolink', function() {
            let init;
            beforeEach(function() {
                init = sinon.spy((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            describe('with a timeout', function() {
                it('rejects if the timeout expires', async function() {
                    const spawnLimit = 300;
                    const init = sinon.spy((_ctx, _caller) => ok);
                    await expect(
                        gen.start(ctxClient, nolink, undefined, init, {
                            timeout: spawnLimit,
                        })
                    ).to.eventually.be.rejectedWith(OTPError, String(otp.Symbols.timeout));
                });
            });
        });
        describe('link', function() {
            let init;
            beforeEach(function() {
                init = sinon.spy((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            describe('with a timeout', function() {
                it('rejects if the timeout expires', async function() {
                    const spawnLimit = 300;
                    const init = sinon.spy((ctx, _caller) => ctx.receive());
                    await expect(
                        gen.start(ctxClient, link, undefined, init, {
                            timeout: spawnLimit,
                        })
                    ).to.eventually.be.rejectedWith(OTPError, String(timeout));
                });
            });
        });
        describe('unknown', function() {
            let init;
            beforeEach(function() {
                init = sinon.spy((ctx, caller) => {
                    proc_lib.initAck(ctx, caller, t(ok, ctx.self()));
                });
            });
            it('treats it like nolink', async function() {
                const badLinkingStyle = Symbol();
                const { links: linksBefore } = ctxClient.processInfo(
                    ctxClient.self()
                );
                const response = await gen.start(
                    ctxClient,
                    badLinkingStyle,
                    undefined,
                    init,
                    {}
                );
                const { links: linksAfter } = ctxClient.processInfo(
                    ctxClient.self()
                );

                expect(linksBefore.length).to.equal(linksAfter.length);
                expect(response).to.matchPattern(t(ok, Pid.isPid));
            });
        });
    });
});
describe('reply', function() {
    it('sends response to pid for the call identified by ref', async function() {
        const ref = ctxClient.ref();
        const from = t(ctxClient.self(), ref);
        const response = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        expect(function() {
            gen.reply(from, response);
        }).to.throw();
        expect(function() {
            gen.reply(ctxServer, from, response);
        }).not.to.throw();
        await expect(ctxClient.receive()).to.eventually.matchPattern(
            t(ref, response)
        );
    });
});
describe('unregisterName', function() {
    describe('with a pid', function() {
        it('returns ok', function() {
            const ctx = node.makeContext();
            expect(gen.unregisterName(ctx.self())).to.equal(ok);
        });
    });
    describe('with a local name tuple', function() {
        let name;
        let tuple;
        beforeEach(function() {
            name = Symbol();
            tuple = t('local', name);
        });
        describe('when the name is registered', function() {
            let ctx;
            beforeEach(function() {
                ctx = node.makeContext();
                ctx.register(name);
            });
            it('returns ok', function() {
                const ctx = node.makeContext();
                expect(gen.unregisterName(ctx, tuple)).to.equal(ok);
            });
            it('removes the registration', function() {
                const ctx = node.makeContext();
                expect(ctx.whereis(name)).to.matchPattern(Pid.isPid);
                gen.unregisterName(ctx, tuple);
                expect(ctx.whereis(name)).to.be.undefined;
            });
        });
    });
});
describe('call', function() {
    describe('to a dead local pid', function() {
        let ctx;
        let normalDeathPid;
        let abnormalDeathPid;

        beforeEach(async function() {
            ctx = node.makeContext();

            const normalDeathCtx = node.makeContext();
            normalDeathPid = normalDeathCtx.self();
            normalDeathCtx.die(normal);

            const abnormalDeathCtx = node.makeContext();
            abnormalDeathPid = abnormalDeathCtx.self();
            abnormalDeathCtx.die(badarg);

            await wait();
        });

        it('throws a OTPError with the down reason', async function() {
            await expect(
                gen.call(ctx, normalDeathPid, t('command', 0))
            ).to.eventually.be.rejectedWith(OTPError, 'noproc');
            await expect(
                gen.call(ctx, abnormalDeathPid, t('command', 0))
            ).to.eventually.be.rejectedWith(OTPError, 'noproc');
        });
    });
    describe('to a living local pid', function() {
        let ctx;
        let receiver;
        let pid;

        beforeEach(function() {
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('signals the receiving pid', async function() {
            const payload = crypto.randomInt(0xffffffff);
            const callPromise = gen.call(ctx, pid, payload);
            const message = await receiver.receive();

            expect(message).to.be.an.instanceOf(Tuple);
            const [tag, from, receivedPayload] = message;
            expect(tag).to.equal($gen_call);
            expect(from).to.be.an.instanceOf(Tuple);
            const [fromPid, fromRef] = from;
            expect(fromPid).to.be.an.instanceOf(Pid);
            expect(Pid.compare(ctx.self(), fromPid)).to.equal(0);
            expect(fromRef).to.be.an.instanceOf(Ref);
            expect(receivedPayload).to.equal(payload);

            gen.reply(receiver, from, ok);
        });
    });
    describe('to a local name', function() {
        describe('which is registered', function() {
            let ctx;
            let receiver;
            let name;

            beforeEach(function() {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
            });

            it('signals the receiving pid', async function() {
                const payload = crypto.randomInt(0xffffffff);
                const callPromise = gen.call(ctx, name, payload);
                const message = await receiver.receive();

                expect(message).to.be.an.instanceOf(Tuple);
                const [tag, from, receivedPayload] = message;
                expect(tag).to.equal($gen_call);
                expect(from).to.be.an.instanceOf(Tuple);
                const [fromPid, fromRef] = from;
                expect(fromPid).to.be.an.instanceOf(Pid);
                expect(Pid.compare(ctx.self(), fromPid)).to.equal(0);
                expect(fromRef).to.be.an.instanceOf(Ref);
                expect(receivedPayload).to.equal(payload);

                gen.reply(receiver, from, ok);
            });
        });
        describe('which is not registered', function() {
            let ctx;
            let receiver;
            let name;

            beforeEach(function() {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
            });

            it('throws a OTPError with the down reason', async function() {
                expect(function() {
                    gen.call(ctx, name, t('command', 0));
                }).to.throwTerm('noproc');
            });
        });
    });
    describe('to a name/node pair', function() {
        describe('to a visible node', function() {
            let ctx;
            let receiver;
            let target;

            beforeEach(function() {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
                target = t(name, node.name);
            });

            it('signals the receiving pid', async function() {
                const payload = crypto.randomInt(0xffffffff);
                const callPromise = gen.call(ctx, target, payload);
                const message = await receiver.receive();

                expect(message).to.be.an.instanceOf(Tuple);
                const [tag, from, receivedPayload] = message;
                expect(tag).to.equal($gen_call);
                expect(from).to.be.an.instanceOf(Tuple);
                const [fromPid, fromRef] = from;
                expect(fromPid).to.be.an.instanceOf(Pid);
                expect(Pid.compare(ctx.self(), fromPid)).to.equal(0);
                expect(fromRef).to.be.an.instanceOf(Ref);
                expect(receivedPayload).to.equal(payload);

                gen.reply(receiver, from, ok);
            });
        });
        describe('to an unknown node', function() {
            let ctx;
            let target;
            let nodeName;

            beforeEach(function() {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                nodeName = Symbol.for('noone@nowhere');
                target = t(name, nodeName);
            });

            it('generates a nodedown EXIT signal', async function() {
                const signal = sinon.spy(node, 'signal');
                const payload = crypto.randomInt(0xffffffff);
                let error;

                expect(function() {
                    try {
                        gen.call(ctx, target, payload);
                    } catch (err) {
                        error = err;
                        throw error;
                    }
                }).to.throw();

                expect(error).to.be.an.instanceOf(OTPError);
                expect(error.term).to.be.an.instanceOf(Tuple);
                const tuple = error.term;
                expect(tuple[0]).to.equal(nodedown);
                expect(tuple[1]).to.equal(nodeName);
            });
        });
    });
    describe('to something unrecognized', function() {
        let ctx;
        let target;

        beforeEach(function() {
            ctx = node.makeContext();
            target = 0;
        });

        it('throws a OTPError with the down reason', async function() {
            expect(function() {
                gen.call(ctx, target, t('command', 0));
            }).to.throwTerm('not_implemented');
        });
    });
    describe('when timed out', function() {
        let timeout;
        let ctx;
        let receiver;
        let pid;

        beforeEach(function() {
            timeout = 300;
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('throws a timeout error', async function() {
            const promise = gen.call(ctx, pid, crypto.randomInt(0xffffffff), timeout);
            await expect(
                promise
            ).to.eventually.be.rejectedWith(OTPError, String(otp.Symbols.timeout));
        });
    });
});
describe('cast', function() {
    describe('to a dead local pid', function() {
        let ctx;
        let normalDeathPid;
        let abnormalDeathPid;

        beforeEach(function() {
            ctx = node.makeContext();

            const normalDeathCtx = node.makeContext();
            normalDeathPid = normalDeathCtx.self();
            normalDeathCtx.die(normal);

            const abnormalDeathCtx = node.makeContext();
            abnormalDeathPid = abnormalDeathCtx.self();
            abnormalDeathCtx.die(badarg);
        });

        it('throws a OTPError with the down reason', async function() {
            expect(gen.cast(ctx, normalDeathPid, t('command', 0))).to.equal(ok);
            expect(gen.cast(ctx, abnormalDeathPid, t('command', 0))).to.equal(ok);
        });
    });
    describe('to a living local pid', function() {
        let ctx;
        let receiver;
        let pid;

        beforeEach(function() {
            ctx = node.makeContext();

            receiver = node.makeContext();
            pid = receiver.self();
        });

        it('signals the receiving pid', async function() {
            const payload = crypto.randomInt(0xffffffff);
            gen.cast(ctx, pid, payload);
            const message = await receiver.receive();

            expect(message).to.be.an.instanceOf(Tuple);
            const [tag, receivedPayload] = message;
            expect(tag).to.equal($gen_cast);
            expect(receivedPayload).to.equal(payload);
        });
    });
    describe('to a local name', function() {
        describe('which is registered', function() {
            let ctx;
            let receiver;
            let name;

            beforeEach(function() {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
            });

            it('signals the receiving pid', async function() {
                const payload = crypto.randomInt(0xffffffff);
                const castResult = gen.cast(ctx, name, payload);
                const message = await receiver.receive();

                expect(message).to.be.an.instanceOf(Tuple);
                const [tag, receivedPayload] = message;
                expect(tag).to.equal($gen_cast);
                expect(receivedPayload).to.equal(payload);
            });
        });
        describe('which is not registered', function() {
            let ctx;
            let receiver;
            let name;

            beforeEach(function() {
                ctx = node.makeContext();

                name = Symbol.for('server_name');
            });

            it('throws a OTPError with the down reason', async function() {
                expect(function() {
                    gen.cast(ctx, name, t('command', 0));
                }).to.throwTerm('noproc');
            });
        });
    });
    describe('to a name/node pair', function() {
        describe('to a visible node', function() {
            let ctx;
            let receiver;
            let target;

            beforeEach(function() {
                ctx = node.makeContext();

                const name = Symbol.for('server_name');
                receiver = node.makeContext();
                receiver.register(name);
                target = t(name, node.name);
            });

            it('signals the receiving pid', async function() {
                const payload = crypto.randomInt(0xffffffff);
                const castPromise = gen.cast(ctx, target, payload);
                const message = await receiver.receive();

                expect(message).to.be.an.instanceOf(Tuple);
                const [tag, receivedPayload] = message;
                expect(tag).to.equal($gen_cast);
                expect(receivedPayload).to.equal(payload);
            });
        });
        describe('to an unknown node', function() {
            let ctx;
            let target;
            let nodeName;

            beforeEach(function() {
                ctx = node.makeContext();

                const serverName = Symbol.for('server_name');
                nodeName = Symbol.for('noone@nowhere');
                target = t(serverName, nodeName);
            });

            it('generates a nodedown EXIT signal', async function() {
                const signal = sinon.spy(node, 'signal');
                const payload = crypto.randomInt(0xffffffff);
                let error;

                expect(function() {
                    try {
                        gen.cast(ctx, target, payload);
                    } catch (err) {
                        error = err;
                        throw error;
                    }
                }).to.throw();

                expect(error).to.be.an.instanceOf(OTPError);
                expect(error.term).to.be.an.instanceOf(Tuple);
                const tuple = error.term;
                expect(tuple[0]).to.equal(nodedown);
                expect(tuple[1]).to.equal(nodeName);
            });
        });
    });
    describe('to something unrecognized', function() {
        let ctx;
        let target;

        beforeEach(function() {
            ctx = node.makeContext();
            target = 0;
        });

        it('throws a OTPError with the down reason', async function() {
            expect(function() {
                gen.cast(ctx, target, t('command', 0));
            }).to.throwTerm('not_implemented');
        });
    });
});
