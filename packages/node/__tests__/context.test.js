/* eslint-env mocha */
import { Node } from '#node';
import { t, OTPError } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import {
    ok,
    DOWN,
    normal,
    kill,
    killed,
    badarg,
    EXIT,
    trap_exit,
    shutdown,
    error,
    monitor,
    demonitor,
    timeout,
} from '#symbols';

function log(ctx, ...args) {
    return ctx.log.extend('core:__tests__')(...args);
}

async function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const { spread, _, skip_matching } = matching.Symbols;

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

let timeoutSpy;
beforeEach(function() {
    timeoutSpy = sinon.spy(global, 'setTimeout');
});
afterEach(function() {
    sinon.restore();
})

describe('@otpjs/node.Context', () => {
    let node;
    let ctxA;
    let ctxB;

    beforeEach(function() {
        node = new Node();
        ctxA = node.makeContext();
        ctxB = node.makeContext();
    });

    it('contains a reference to its environment', function() {
        expect(ctxA.env).to.equal(node);
        expect(ctxB.env).to.equal(node);
    });

    it('contains a skip_matching mark', function() {
        expect(ctxA[skip_matching]).to.equal(true);
        expect(ctxB[skip_matching]).to.equal(true);
    });

    it('provides a logging interface', function() {
        expect(ctxA.log).to.be.an.instanceOf(Function);
        expect(() => ctxA.log('test')).not.to.throw();
    });

    describe('receive', function() {
        describe('given nothing', function() {
            it('waits for any message', async function() {
                ctxB.send(ctxA.self(), 42);
                await expect(ctxA.receive()).to.eventually.equal(42);
            });
            it('sets no timeout', async function() {
                let pending = true;
                sinon.reset();
                const receiving = ctxA.receive();
                receiving.finally(() => {
                    pending = false;
                });
                expect(timeoutSpy).not.to.have.been.called;
                await wait(300);
                expect(pending).to.equal(true);
                ctxB.send(ctxA.self(), 'finish');
                await expect(receiving).to.eventually.equal('finish');
                expect(pending).to.equal(false);
            });
        });
        describe('given only a pattern', function() {
            let pattern;
            beforeEach(function() {
                pattern = matching.oneOf(Number.isInteger, Number.isFinite);
            });
            it('waits for a matching message', async function() {
                const receivePromise = ctxA.receive(pattern);

                ctxB.send(ctxA.self(), Infinity);
                await wait();
                ctxB.send(ctxA.self(), 'not a number');
                await wait();
                ctxB.send(ctxA.self(), 42);

                await expect(receivePromise).to.eventually.equal(42);
            });
            it('sets no timeout', async function() {
                let pending = true;
                sinon.reset();
                const receiving = ctxA.receive();
                receiving.finally(() => {
                    pending = false;
                });
                expect(timeoutSpy).not.to.have.been.called;
                await wait(300);
                expect(pending).to.equal(true);
                ctxB.send(ctxA.self(), 'finish');
                await expect(receiving).to.eventually.equal('finish');
                expect(pending).to.equal(false);
            });
        });
        describe('given only a timeout', function() {
            it('waits for any message', async function() {
                ctxB.send(ctxA.self(), 42);
                await expect(ctxA.receive()).to.eventually.equal(42);
            });
            it('sets a timeout', async function() {
                ctxA.receive(500).catch(() => ok);
                await wait();
                expect(timeoutSpy).to.have.been.called;
            });
            it('throws if the timeout is exceeded', async function() {
                const sendPromise = ctxA.receive(100);
                sendPromise.catch(() => ok);
                await wait();
                expect(timeoutSpy).to.have.been.called;
                await expect(sendPromise).to.be.rejectedWithTerm(timeout);
            });
        });
        describe('given a pattern and a timeout', function() {
            let pattern;
            beforeEach(function() {
                pattern = matching.oneOf(Number.isInteger, Number.isFinite);
            });

            it('waits for a matching message', async function() {
                const receivePromise = ctxA.receive(pattern, 500);

                ctxB.send(ctxA.self(), Infinity);
                await wait();
                ctxB.send(ctxA.self(), 'not a number');
                await wait();
                ctxB.send(ctxA.self(), 42);

                await expect(receivePromise).to.eventually.equal(42);
            });

            it('sets a timeout', async function() {
                ctxA.receive(pattern, 500).catch(() => ok);
                await wait();
                expect(timeoutSpy).to.have.been.calledWith(
                    sinon.match.func,
                    500
                );
            });

            it('throws if the timeout is exceeded', async function() {
                const sendPromise = ctxA.receive(pattern, 100);
                sendPromise.catch(() => ok);
                await wait();
                expect(timeoutSpy).to.have.been.calledWithMatch(
                    sinon.match.func,
                    100
                );
                await expect(sendPromise).to.be.rejectedWithTerm(timeout);
            });
        });
        describe('given too many arguments', function() {
            it('throws a badarg error', async function() {
                await expect(
                    ctxA.receive(_, 500, 'please')
                ).to.be.rejectedWithTerm(badarg);
            });
        });
    });
    describe('receiveBlock', function() {
        it('is a function', function() {
            expect(ctxA.receiveBlock).to.be.an.instanceOf(Function);
        });
        describe('given a block composer', function() {
            it('calls the block composer', async function() {
                const composer = sinon.stub();
                ctxA.receiveBlock(composer);
                expect(composer).to.have.been.called;
            });
            it('passes a block builder', function() {
                const composer = sinon.stub();
                ctxA.receiveBlock(composer);
                expect(composer).to.have.been.calledWithMatch(
                    sinon.match.func,
                    sinon.match.func
                );
            });
            describe('the builders given helper', function() {
                describe('given a pattern', function() {
                    it('returns a then helper', function() {
                        const composer = sinon.spy((given) => {
                            expect(given(_)).to.equal(
                                expect.objectContaining({
                                    then: sinon.match.func,
                                })
                            );
                        });
                        ctxA.receiveBlock(composer);
                    });
                    describe('when the pattern throws', function() {
                        it('assumes the message does not match', async function() {

                            const pattern = sinon.spy(() => {
                                throw OTPError('not a message');
                            });
                            const doBad = sinon.spy(() => 'bad');
                            const doGood = sinon.spy(() => 'good');
                            const compose = sinon.spy((given) => {
                                given(pattern).then(doBad);
                                given(_).then(doGood);
                            });

                            node.deliver(
                                node.systemPid,
                                ctxA.self(),
                                'any message'
                            );

                            await expect(
                                ctxA.receiveBlock(compose)
                            ).to.eventually.equal('good');
                            expect(pattern).to.have.been.calledWith('any message');
                            expect(doBad).not.to.have.been.called;
                            expect(doGood).to.have.been.calledWith('any message');
                        });
                    });
                    describe('the then helper', function() {
                        it('adds the clause to the block', async function() {
                            const handler = sinon.stub();
                            const composer = sinon.spy((given) => {
                                given(_).then(handler);
                            });
                            node.deliver(
                                node.systemPid,
                                ctxA.self(),
                                'test message'
                            );
                            await ctxA.receiveBlock(composer);
                            expect(handler).to.have.been.calledWith(
                                'test message'
                            );
                        });
                    });
                });
            });
            describe('the builders after helper', function() {
                describe('given a millisecond duration', function() {
                    it('returns a then helper', function() {
                        const composer = sinon.spy((_given, after) => {
                            expect(after(300)).to.equal(
                                expect.objectContaining({
                                    then: sinon.match.func,
                                })
                            );
                        });
                        ctxA.receiveBlock(composer);
                    });

                    describe('the then helper', function() {
                        describe('given a millisecond duration', function() {
                            it('adds a timeout handler to the block', async function() {
                                const handler = sinon.stub();
                                const composer = sinon.spy((given, after) => {
                                    after(300).then(handler);
                                });
                                await ctxA.receiveBlock(composer);
                                expect(handler).to.have.been.called;
                            });
                        });
                    });
                });
            });
        });
        describe('the resulting block', function() {
            it('prefers the earliest matching block', async function() {
                const onFinite = sinon.spy(() => 'finite');
                const onInfinite = sinon.spy(() => 'infinite');
                const otherwise = sinon.spy(() => 'other');

                const composer = (given) => {
                    given(Number.isFinite).then(onFinite);
                    given(Infinity).then(onInfinite);
                    given(_).then(otherwise);
                };

                node.deliver(node.systemPid, ctxA.self(), 'not a number');
                await expect(ctxA.receiveBlock(composer)).to.eventually.equal(
                    'other'
                );
                expect(otherwise).to.have.been.calledWith('not a number');
                expect(onFinite).not.to.have.been.called;
                expect(onInfinite).not.to.have.been.called;

                sinon.reset();

                node.deliver(node.systemPid, ctxA.self(), Infinity);
                await expect(ctxA.receiveBlock(composer)).to.eventually.equal(
                    'infinite'
                );
                expect(otherwise).not.to.have.been.called;
                expect(onFinite).not.to.have.been.called;
                expect(onInfinite).to.have.been.calledWith(Infinity);

                sinon.reset();

                node.deliver(node.systemPid, ctxA.self(), 500);
                await expect(ctxA.receiveBlock(composer)).to.eventually.equal(
                    'finite'
                );
                expect(otherwise).not.to.have.been.called;
                expect(onFinite).to.have.been.calledWith(500);
                expect(onInfinite).not.to.have.been.called;
            });
            it('ignores messages which do not match any clause of the block', async function() {
                const onFinite = () => 'finite';
                const onInfinite = () => 'infinite';

                const composer = (given) => {
                    given(Number.isFinite).then(onFinite);
                    given(Infinity).then(onInfinite);
                };

                const receiver = ctxA.receiveBlock(composer);

                node.deliver(node.systemPid, ctxA.self(), 'a string');
                await wait();

                node.deliver(node.systemPid, ctxA.self(), Infinity);
                await wait();

                await expect(receiver).to.eventually.equal('infinite');
            });
            describe('given an error', function() {
                it('rejects the entire block with the error', async function() {
                    const throwError = sinon.spy(() => {
                        throw OTPError('test error');
                    });

                    const composer = (given) => {
                        given(_).then(throwError);
                    };

                    const receive = ctxA.receiveBlock(composer);

                    node.deliver(node.systemPid, ctxA.self(), 'a string');

                    await expect(receive).to.be.rejectedWithTerm('test error');
                });
            });
        });
        describe('when interrupted', function() {
            it('rejects the interrupted receive block', async function() {
                const handler = sinon.stub();
                const block = ctxA.receiveBlock((given, _after) => {
                    given(_).then(handler);
                });

                ctxA.exit(shutdown);
                await expect(block).to.be.rejectedWithTerm(shutdown);
            });
        });
    });

    describe('helpers', function() {
        it('points env to node', function() {
            expect(ctxA.env).to.equal(node);
            expect(ctxB.env).to.equal(node);
        });
        describe('log', function() {
            it('has a default implementation', function() {
                expect(ctxA.log).to.be.an.instanceOf(Function);
                expect(ctxB.log).to.be.an.instanceOf(Function);
            });
            it('can be overridden', function() {
                const fn = sinon.stub();
                expect(function() {
                    ctxA.log = fn;
                }).not.to.throw();
                ctxA.log('test', 123);
                expect(fn).to.have.been.calledWith('test', 123);
            });
        });
        describe('processInfo', function() {
            it('returns an object', function() {
                expect(ctxA.processInfo(ctxB.self())).to.be.an.instanceOf(Object);
            });
            describe('the returned object', function() {
                it('describes the context state', function() {
                    expect(ctxA.processInfo(ctxA.self())).to.matchPattern({
                        status: 'running',
                        links: [],
                        messageQueueLength: 0,
                        messages: [],
                        monitors: [],
                    });
                });
                describe('when the context is receiving a message', function() {
                    it('reports the status as waiting', function() {
                        ctxB.receive();
                        expect(ctxA.processInfo(ctxB.self())).to.matchPattern({
                            status: 'waiting',
                            [spread]: _,
                        });
                    });
                });
            });
        });
        describe('drain', function() {
            it('removes any unprocessed messages', async function() {
                ctxA.send(ctxB.self(), 42);
                ctxA.send(ctxB.self(), 'the meaning of life');

                await wait();

                expect(ctxA.processInfo(ctxB.self())).to.matchPattern({
                    messageQueueLength: 2,
                    messages: [42, 'the meaning of life'],
                    [spread]: _,
                });

                expect(() => ctxB.drain()).not.to.throw();

                expect(ctxA.processInfo(ctxB.self())).to.matchPattern({
                    messageQueueLength: 0,
                    messages: [],
                    [spread]: _,
                });
            });
        });
        describe('die', function() {
            it('ends the context', async function() {
                expect(function() {
                    return ctxA.die(normal);
                }).not.to.throw();
                await wait(50);
                expect(ctxA._processInfo()).to.be.undefined;
                await expect(ctxA.death).to.eventually.equal(normal);
            });
            it('does not unwrap errors', async function() {
                ctxA.die(OTPError(badarg));
                await wait(50);
                expect(ctxA._processInfo()).to.be.undefined;
                await expect(ctxA.death).to.eventually.be.an.instanceOf(OTPError);
                const error = await ctxA.death;
                expect(error.term).to.equal(badarg);
            });

            describe('when links are present', function() {
                it('notifies the links', async function() {
                    ctxB.processFlag(trap_exit, true);
                    ctxA.link(ctxB.self());
                    await wait();
                    ctxA.die(shutdown);
                    await wait();
                    await expect(ctxB.receive()).to.eventually.matchPattern(
                        t(EXIT, ctxA.self(), shutdown)
                    );
                });
            });

            describe('when monitors are present', function() {
                it('notifies the monitors', async function() {
                    const mref = ctxB.monitor(ctxA.self());

                    await wait();

                    ctxA.die(shutdown);

                    await expect(ctxB.receive()).to.eventually.matchPattern(
                        t(DOWN, mref, 'process', ctxA.self(), shutdown)
                    );
                });
            });
        });
        describe('forwarded operations', function() {
            it('does not intercept errors', async function() {
                expect(function() {
                    ctxA.node({
                        get node() {
                            throw OTPError(badarg);
                        },
                    });
                }).to.throwTerm(badarg);
            });
            describe('processFlag', function() {
                describe('called with just the flag', function() {
                    it('rejects unknown flags', function() {
                        const imaginaryFlag = Symbol();
                        log(
                            ctxB,
                            'processFlag.rejectsUnknownFlags(imaginaryFlag: %o)',
                            imaginaryFlag
                        );
                        expect(
                            ctxA.processFlag.bind(ctxA, imaginaryFlag)
                        ).to.throwTerm(t('unknown_flag', imaginaryFlag));
                    });
                    it('returns the current value of the flag', function() {
                        expect(ctxA.processFlag(trap_exit)).to.be.undefined;
                    });
                });
                describe('called with a flag and a value', function() {
                    it('rejects unknown flags', function() {
                        const imaginaryFlag = Symbol();
                        expect(
                            ctxA.processFlag.bind(ctxA, imaginaryFlag, true)
                        ).to.throwTerm(t('unknown_flag', imaginaryFlag));
                    });
                    it('updates the value of the flag', function() {
                        expect(ctxA.processFlag(trap_exit)).to.be.undefined;
                        expect(ctxA.processFlag(trap_exit, true)).to.equal(true);
                        expect(ctxA.processFlag(trap_exit)).to.equal(true);
                    });
                });
                describe('trap_exit', function() {
                    it('is disabled by default', function() {
                        expect(ctxA.processFlag(trap_exit)).to.be.undefined;
                    });
                    describe('when enabled', function() {
                        it('captures exit signals', async function() {
                            ctxA.processFlag(trap_exit, true);
                            ctxA.link(ctxB.self());
                            await new Promise((resolve) => setTimeout(resolve));
                            ctxA.exit(ctxB.self(), kill);
                            await new Promise((resolve) => setTimeout(resolve));
                            await expect(
                                ctxA.receive()
                            ).to.eventually.matchPattern(t(EXIT, _, _));
                        });
                    });
                    describe('when disabled', function() {
                        it('exits after receiving an exit signal', async function() {
                            ctxA.link(ctxB.self());
                            ctxA.exit(ctxB.self(), kill);

                            await wait(50);

                            expect(ctxB.dead).to.equal(true);
                            expect(ctxA.dead).to.equal(true);
                            await expect(ctxA.death).to.eventually.equal(killed);
                        });
                    });
                });
            });
            describe('exit', function() {
                describe('given a pid and a reason', function() {
                    it('sends an exit signal to the corresponding process', async function() {
                        ctxA.exit(ctxB.self(), kill);
                        await wait();
                        expect(ctxB.dead).to.equal(true);
                        await expect(ctxB.death).to.eventually.equal(killed);
                    });
                });
                describe('given only a reason', function() {
                    it('exits the calling process', async function() {
                        expect(function() {
                            ctxA.exit(shutdown);
                        }).not.to.throw();
                        await wait();
                        expect(ctxA.dead).to.equal(true);
                        await expect(ctxA.death).to.eventually.equal(shutdown);
                    });
                });
            });
            describe('register', function() {
                it('invokes node.register', function() {
                    const name = Symbol.for('test_name');
                    expect(function() {
                        ctxA.register(name);
                    }).not.to.throw();
                });
                it('fails if node.register throws', function() {
                    const name = 'not a symbol';
                    expect(function() {
                        ctxA.register(name);
                    }).to.throwTerm(badarg);
                });
            });
            describe('monitor', function() {
                it('sends a monitor signal to the corresponding process', async function() {
                    let mref;
                    expect(function() {
                        mref = ctxA.monitor(ctxB.self());
                    }).not.to.throw();

                    await wait();

                    expect(ctxB.processInfo(ctxB.self())).to.matchPattern({
                        monitors: [ctxA.self()],
                        [spread]: _,
                    });
                });
            });
            describe('demonitor', function() {
                let mref;
                beforeEach(function() {
                    mref = ctxA.monitor(ctxB.self());
                });
                it('sends a demonitor signal to the corresponding process', async function() {
                    const signal = sinon.spy(node, 'signal');
                    expect(function() {
                        ctxA.demonitor(mref);
                    }).not.to.throw();

                    await wait();

                    expect(ctxB.processInfo(ctxB.self())).to.matchPattern({
                        monitors: [],
                        [spread]: _,
                    });
                    expect(signal).to.have.been.calledWith(
                        ctxA.self(),
                        demonitor,
                        ctxB.self(),
                        mref
                    );
                });
            });
        });
        describe('signal', function() {
            it('receives from node.signal', function() {
                const signal = sinon.spy(ctxB, 'signal');
                const false_signal = Symbol.for('false_signal');
                expect(
                    node.signal(ctxA.self(), false_signal, ctxB.self())
                ).to.matchPattern(ok);
                expect(signal).to.have.been.calledWith(false_signal, ctxA.self());
            });
            describe('given an exit signal', function() {
                describe('when the process is dead', function() {
                    it('ignores the signal', async function() {
                        ctxA.die(killed);
                        const die = sinon.spy(ctxA, 'die');
                        await wait();
                        ctxA.signal(EXIT, node.systemPid, kill);
                        await wait();
                        expect(die).not.to.have.been.called;
                    });
                });
                describe('when the process is alive', function() {
                    it('exits the process', async function() {
                        const die = sinon.spy(ctxA, 'die');
                        ctxA.signal(EXIT, node.systemPid, kill);
                        await wait();
                        expect(die).to.have.been.calledWith(killed);
                    });
                });
            });
        });
    });

    describe('when linked', function() {
        it('can unlink if it created the link', async function() {
            ctxA.link(ctxB.self());
            await wait();
            expect(function() {
                ctxA.unlink(ctxB.self());
            }).not.to.throw();
            await wait();
            expect(ctxA.processInfo(ctxA.self())).to.matchPattern({
                links: [],
                [spread]: _,
            });
        });
        it('will not add a duplicate link', async function() {
            ctxA.link(ctxB.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });
            expect(ctxB.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });

            ctxB.link(ctxA.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });
            expect(ctxB.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });

            ctxA.link(ctxB.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });
            expect(ctxB.processInfo(ctxA.self())).to.matchPattern({
                links: [_],
                [spread]: _,
            });
        });
    });
});
