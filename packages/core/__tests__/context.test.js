/* eslint-env jest */
import * as core from '../src';
import { t, l, Pid, OTPError } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import '@otpjs/test_utils';
import { timeout } from '../src/symbols';

function log(ctx, ...args) {
    return ctx.log.extend('core:__tests__')(...args);
}

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const { ok, DOWN, normal, kill, killed, badarg, EXIT, trap_exit, shutdown, error, monitor, demonitor } = core.Symbols;
const { spread, _, route_clause, skip_matching } = matching.Symbols;

describe('@otpjs/core.Context', () => {
    let node;
    let ctxA;
    let ctxB;

    beforeEach(function () {
        node = new core.Node();
        ctxA = node.makeContext();
        ctxB = node.makeContext();
    });

    it('contains a reference to its environment', function () {
        expect(ctxA.env).toBe(node);
        expect(ctxB.env).toBe(node);
    });

    it('contains a skip_matching mark', function () {
        expect(ctxA[skip_matching]).toBe(true);
        expect(ctxB[skip_matching]).toBe(true);
    });

    it('provides a logging interface', function () {
        expect(ctxA.log).toBeInstanceOf(Function);
        expect(() => ctxA.log('test')).not.toThrow();
    });

    describe('receive', function () {
        describe('given nothing', function () {
            let timeoutSpy;
            beforeEach(function () {
                timeoutSpy = jest.spyOn(global, 'setTimeout');
                jest.clearAllMocks();
            });
            it('waits for any message', async function () {
                ctxB.send(ctxA.self(), 42);
                await expect(ctxA.receive()).resolves.toBe(42);
            });
            it('sets no timeout', async function () {
                let pending = true;
                const receiving = ctxA.receive();
                receiving.finally(() => {
                    pending = false;
                });
                expect(timeoutSpy).not.toHaveBeenCalled();
                await wait(1000);
                expect(pending).toBe(true);
                ctxB.send(ctxA.self(), 'finish');
                await expect(receiving).resolves.toBe('finish');
                expect(pending).toBe(false);
            });
        });
        describe('given only a pattern', function () {
            let pattern;
            let timeoutSpy;
            beforeEach(function () {
                pattern = matching.oneOf(Number.isInteger, Number.isFinite);
                timeoutSpy = jest.spyOn(global, 'setTimeout');
                jest.clearAllMocks();
            });
            it('waits for a matching message', async function () {
                const receivePromise = ctxA.receive(pattern);

                ctxB.send(ctxA.self(), Infinity);
                await wait();
                ctxB.send(ctxA.self(), 'not a number');
                await wait();
                ctxB.send(ctxA.self(), 42);

                await expect(receivePromise).resolves.toBe(42);
            });
            it('sets no timeout', async function () {
                let pending = true;
                const receiving = ctxA.receive();
                receiving.finally(() => {
                    pending = false;
                });
                expect(timeoutSpy).not.toHaveBeenCalled();
                await wait(1000);
                expect(pending).toBe(true);
                ctxB.send(ctxA.self(), 'finish');
                await expect(receiving).resolves.toBe('finish');
                expect(pending).toBe(false);
            });
        });
        describe('given only a timeout', function () {
            let timeoutSpy;
            beforeEach(function () {
                timeoutSpy = jest.spyOn(global, 'setTimeout');
                jest.clearAllMocks();
            });
            it('waits for any message', async function () {
                ctxB.send(ctxA.self(), 42);
                await expect(ctxA.receive()).resolves.toBe(42);
            });
            it('sets a timeout', async function () {
                ctxA.receive(500).catch(() => ok);
                await wait();
                expect(timeoutSpy).toHaveBeenCalled();
            });
            it('throws if the timeout is exceeded', async function () {
                const sendPromise = ctxA.receive(500);
                sendPromise.catch(() => ok);
                await wait();
                expect(timeoutSpy).toHaveBeenCalled();
                await expect(sendPromise).rejects.toThrowTerm(timeout);
            });
        });
        describe('given a pattern and a timeout', function () {
            let pattern;
            let timeoutSpy;
            beforeEach(function () {
                pattern = matching.oneOf(Number.isInteger, Number.isFinite);
                timeoutSpy = jest.spyOn(global, 'setTimeout');
                jest.clearAllMocks();
            });

            it('waits for a matching message', async function () {
                const receivePromise = ctxA.receive(pattern, 500);

                ctxB.send(ctxA.self(), Infinity);
                await wait();
                ctxB.send(ctxA.self(), 'not a number');
                await wait();
                ctxB.send(ctxA.self(), 42);

                await expect(receivePromise).resolves.toBe(42);
            });

            it('sets a timeout', async function () {
                ctxA.receive(pattern, 500).catch(() => ok);
                await wait();
                expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
            });

            it('throws if the timeout is exceeded', async function () {
                const sendPromise = ctxA.receive(pattern, 500);
                sendPromise.catch(() => ok);
                await wait();
                expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
                await expect(sendPromise).rejects.toThrowTerm(timeout);
            });
        });
        describe('given too many arguments', function () {
            it('throws a badarg error', async function () {
                await expect(ctxA.receive(_, 500, 'please')).rejects.toThrowTerm(badarg);
            });
        });
    });
    describe('receiveBlock', function () {
        it('is a function', function () {
            expect(ctxA.receiveBlock).toBeInstanceOf(Function);
        });
        describe('given a block composer', function () {
            it('calls the block composer', async function () {
                expect.assertions(1);
                const composer = jest.fn();
                ctxA.receiveBlock(composer);
                expect(composer).toHaveBeenCalled();
            });
            it('passes a block builder', function () {
                expect.assertions(1);
                const composer = jest.fn();
                ctxA.receiveBlock(composer);
                expect(composer).toHaveBeenCalledWith(
                    expect.any(Function),
                    expect.any(Function)
                );
            });
            describe('the builders given helper', function () {
                describe('given a pattern', function () {
                    it('returns a then helper', function () {
                        expect.assertions(1);
                        const composer = jest.fn(given => {
                            expect(given(_)).toEqual(expect.objectContaining({
                                then: expect.any(Function)
                            }));
                        });
                        ctxA.receiveBlock(composer);
                    });
                    describe('when the pattern throws', function () {
                        it('assumes the message does not match', async function () {
                            expect.assertions(4);

                            const pattern = jest.fn(() => {
                                throw OTPError('not a message');
                            });
                            const doBad = jest.fn(() => 'bad');
                            const doGood = jest.fn(() => 'good');
                            const compose = jest.fn(given => {
                                given(pattern).then(doBad);
                                given(_).then(doGood);
                            });

                            node.deliver(node.systemPid, ctxA.self(), 'any message');

                            await expect(ctxA.receiveBlock(compose)).resolves.toBe(
                                'good'
                            );
                            expect(pattern).toHaveBeenCalledWith('any message');
                            expect(doBad).not.toHaveBeenCalled();
                            expect(doGood).toHaveBeenCalledWith('any message');
                        });
                    });
                    describe('the then helper', function () {
                        it('adds the clause to the block', async function () {
                            expect.assertions(1);
                            const handler = jest.fn();
                            const composer = jest.fn(given => {
                                given(_).then(handler);
                            });
                            node.deliver(node.systemPid, ctxA.self(), 'test message');
                            await ctxA.receiveBlock(composer);
                            expect(handler).toHaveBeenCalledWith('test message');
                        });
                    });
                });
            });
            describe('the builders after helper', function () {
                describe('given a millisecond duration', function () {
                    it('returns a then helper', function () {
                        expect.assertions(1);
                        const composer = jest.fn((_given, after) => {
                            expect(after(300)).toEqual(expect.objectContaining({
                                then: expect.any(Function)
                            }));
                        });
                        ctxA.receiveBlock(composer);
                    });

                    describe('the then helper', function () {
                        describe('given a millisecond duration', function () {
                            it('adds a timeout handler to the block', async function () {
                                expect.assertions(1);
                                const handler = jest.fn();
                                const composer = jest.fn((given, after) => {
                                    after(300).then(handler);
                                });
                                await ctxA.receiveBlock(composer);
                                expect(handler).toHaveBeenCalled();
                            });
                        });
                    });
                });
            });
        });
        describe('the resulting block', function () {
            it('prefers the earliest matching block', async function () {
                const onFinite = jest.fn(() => 'finite');
                const onInfinite = jest.fn(() => 'infinite');
                const otherwise = jest.fn(() => 'other');

                const composer = (given) => {
                    given(Number.isFinite).then(onFinite);
                    given(Infinity).then(onInfinite);
                    given(_).then(otherwise);
                };

                node.deliver(node.systemPid, ctxA.self(), 'not a number');
                await expect(ctxA.receiveBlock(composer)).resolves.toBe('other');
                expect(otherwise).toHaveBeenCalledWith('not a number');
                expect(onFinite).not.toHaveBeenCalled();
                expect(onInfinite).not.toHaveBeenCalled();

                jest.clearAllMocks();

                node.deliver(node.systemPid, ctxA.self(), Infinity);
                await expect(ctxA.receiveBlock(composer)).resolves.toBe('infinite');
                expect(otherwise).not.toHaveBeenCalled();
                expect(onFinite).not.toHaveBeenCalled();
                expect(onInfinite).toHaveBeenCalledWith(Infinity);

                jest.clearAllMocks();

                node.deliver(node.systemPid, ctxA.self(), 500);
                await expect(ctxA.receiveBlock(composer)).resolves.toBe('finite');
                expect(otherwise).not.toHaveBeenCalled();
                expect(onFinite).toHaveBeenCalledWith(500);
                expect(onInfinite).not.toHaveBeenCalled();
            });
            it('ignores messages which do not match any clause of the block', async function () {
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

                await expect(receiver).resolves.toBe('infinite');
            });
        });
        describe('when interrupted', function () {
            it('rejects the interrupted receive block', async function () {
                const handler = jest.fn();
                const block = ctxA.receiveBlock((given, _after) => {
                    given(_).then(handler);
                });

                ctxA.exit(shutdown);
                await expect(block).rejects.toMatchPattern(shutdown);
            });
        });
    });

    describe('helpers', function () {
        it('points env to node', function () {
            expect(ctxA.env).toBe(node);
            expect(ctxB.env).toBe(node);
        });
        describe('log', function () {
            it('has a default implementation', function () {
                expect(ctxA.log).toBeInstanceOf(Function);
                expect(ctxB.log).toBeInstanceOf(Function);
            });
            it('can be overridden', function () {
                const fn = jest.fn();
                expect(function () {
                    ctxA.log = fn;
                }).not.toThrow();
                ctxA.log('test', 123);
                expect(fn).toHaveBeenCalledWith('test', 123);
            });
        });
        describe('processInfo', function () {
            it('returns an object', function () {
                expect(ctxA.processInfo(ctxB.self())).toBeInstanceOf(Object);
            });
            describe('the returned object', function () {
                it('describes the context state', function () {
                    expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                        status: 'running',
                        links: [],
                        messageQueueLength: 0,
                        messages: [],
                        monitors: []
                    });
                });
                describe('when the context is receiving a message', function () {
                    it('reports the status as waiting', function () {
                        ctxB.receive();
                        expect(ctxA.processInfo(ctxB.self())).toMatchPattern({
                            status: 'waiting',
                            [spread]: _
                        });
                    });
                });
            });
        });
        describe('drain', function () {
            it('removes any unprocessed messages', async function () {
                ctxA.send(ctxB.self(), 42);
                ctxA.send(ctxB.self(), 'the meaning of life');

                await wait();

                expect(ctxA.processInfo(ctxB.self())).toMatchPattern({
                    messageQueueLength: 2,
                    messages: [42, 'the meaning of life'],
                    [spread]: _
                });

                expect(() => ctxB.drain()).not.toThrow();

                expect(ctxA.processInfo(ctxB.self())).toMatchPattern({
                    messageQueueLength: 0,
                    messages: [],
                    [spread]: _
                });
            });
        });
        describe('die', function () {
            it('ends the context', async function () {
                expect(function () {
                    return ctxA.die(normal);
                }).not.toThrow();
                await wait(50);
                expect(ctxA._processInfo()).toBeUndefined();
                await expect(ctxA.death).resolves.toBe(normal);
            });
            it('does not unwrap errors', async function () {
                ctxA.die(OTPError(badarg));
                await wait(50);
                expect(ctxA._processInfo()).toBeUndefined();
                await expect(ctxA.death).resolves.toBeInstanceOf(OTPError);
                const error = await ctxA.death;
                expect(error.term).toBe(badarg);
            });

            describe('when links are present', function () {
                it('notifies the links', async function () {
                    ctxB.processFlag(trap_exit, true);
                    ctxA.link(ctxB.self());
                    await wait();
                    ctxA.die(shutdown);
                    await wait();
                    await expect(ctxB.receive()).resolves.toMatchPattern(t(EXIT, ctxA.self(), shutdown));
                });
            });

            describe('when monitors are present', function () {
                it('notifies the monitors', async function () {
                    const mref = ctxB.monitor(ctxA.self());

                    await wait();

                    ctxA.die(shutdown);

                    await expect(ctxB.receive()).resolves.toMatchPattern(t(
                        DOWN,
                        mref,
                        'process',
                        ctxA.self(),
                        shutdown
                    ));
                });
            });
        });
        describe('forwarded operations', function () {
            it('does not intercept errors', async function () {
                expect.assertions(1);
                expect(function () {
                    ctxA.node({
                        get node() {
                            throw OTPError(badarg);
                        }
                    });
                }).toThrowTerm(badarg);
            });
            describe('processFlag', function () {
                describe('called with just the flag', function () {
                    it('rejects unknown flags', function () {
                        const imaginaryFlag = Symbol();
                        log(
                            ctxB,
                            'processFlag.rejectsUnknownFlags(imaginaryFlag: %o)',
                            imaginaryFlag
                        );
                        expect(
                            ctxA.processFlag.bind(ctxA, imaginaryFlag)
                        ).toThrowTerm(t('unknown_flag', imaginaryFlag));
                    });
                    it('returns the current value of the flag', function () {
                        expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                    });
                });
                describe('called with a flag and a value', function () {
                    it('rejects unknown flags', function () {
                        const imaginaryFlag = Symbol();
                        expect(
                            ctxA.processFlag.bind(ctxA, imaginaryFlag, true)
                        ).toThrowTerm(t('unknown_flag', imaginaryFlag));
                    });
                    it('updates the value of the flag', function () {
                        expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                        expect(ctxA.processFlag(trap_exit, true)).toBe(true);
                        expect(ctxA.processFlag(trap_exit)).toBe(true);
                    });
                });
                describe('trap_exit', function () {
                    it('is disabled by default', function () {
                        expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                    });
                    describe('when enabled', function () {
                        it('captures exit signals', async function () {
                            ctxA.processFlag(trap_exit, true);
                            ctxA.link(ctxB.self());
                            await new Promise((resolve) => setTimeout(resolve));
                            ctxA.exit(ctxB.self(), kill);
                            await new Promise((resolve) => setTimeout(resolve));
                            await expect(ctxA.receive()).resolves.toMatchPattern(
                                t(EXIT, _, _)
                            );
                        });
                    });
                    describe('when disabled', function () {
                        it('exits after receiving an exit signal', async function () {
                            ctxA.link(ctxB.self());
                            ctxA.exit(ctxB.self(), kill);

                            await wait(50);

                            expect(ctxB.dead).toBe(true);
                            expect(ctxA.dead).toBe(true);
                            await expect(ctxA.death).resolves.toBe(killed);
                        });
                    });
                });
            });
            describe('exit', function () {
                describe('given a pid and a reason', function () {
                    it('sends an exit signal to the corresponding process', async function () {
                        ctxA.exit(ctxB.self(), kill);
                        await wait();
                        expect(ctxB.dead).toBe(true);
                        await expect(ctxB.death).resolves.toBe(killed);
                    });
                });
                describe('given only a reason', function () {
                    it('exits the calling process', async function () {
                        expect(function () {
                            ctxA.exit(shutdown);
                        }).not.toThrow();
                        await wait();
                        expect(ctxA.dead).toBe(true);
                        await expect(ctxA.death).resolves.toBe(shutdown);
                    });
                });
            });
            describe('register', function () {
                it('invokes node.register', function () {
                    const register = jest.spyOn(node, 'register');
                    const name = Symbol.for('test_name');
                    expect(function () {
                        ctxA.register(name);
                    }).not.toThrow();
                    expect(register).toHaveBeenCalledWith(ctxA.self(), name);
                });
                it('fails if node.register throws', function () {
                    const register = jest.spyOn(node, 'register');
                    const name = 'not a symbol';

                    expect(function () {
                        ctxA.register(name);
                    }).toThrowTerm(badarg);
                    expect(register).toHaveBeenCalledWith(ctxA.self(), name);
                });
            });
            describe('monitor', function () {
                it('sends a monitor signal to the corresponding process', async function () {
                    const signal = jest.spyOn(node, 'signal');
                    let mref;
                    expect(function () {
                        mref = ctxA.monitor(ctxB.self());
                    }).not.toThrow();

                    await wait();

                    expect(ctxB.processInfo(ctxB.self())).toMatchPattern({
                        monitors: [ctxA.self()],
                        [spread]: _
                    });
                    expect(signal).toHaveBeenCalledWith(ctxA.self(), monitor, ctxB.self(), mref);
                });
            });
            describe('demonitor', function () {
                let mref;
                beforeEach(function () {
                    mref = ctxA.monitor(ctxB.self());
                });
                it('sends a demonitor signal to the corresponding process', async function () {
                    const signal = jest.spyOn(node, 'signal');
                    expect(function () {
                        ctxA.demonitor(mref);
                    }).not.toThrow();

                    await wait();

                    expect(ctxB.processInfo(ctxB.self())).toMatchPattern({
                        monitors: [],
                        [spread]: _
                    });
                    expect(signal).toHaveBeenCalledWith(ctxA.self(), demonitor, ctxB.self(), mref);
                });
            });
        });
        describe('signal', function () {
            it('receives from node.signal', function () {
                const signal = jest.spyOn(ctxB, 'signal');
                const false_signal = Symbol.for('false_signal');
                expect(node.signal(
                    ctxA.self(),
                    false_signal,
                    ctxB.self()
                )).toMatchPattern(ok);
                expect(signal).toHaveBeenCalledWith(false_signal, ctxA.self());
            });
            describe('given an exit signal', function () {
                describe('when the process is dead', function () {
                    it('ignores the signal', async function () {
                        ctxA.die(killed);
                        const die = jest.spyOn(ctxA, 'die');
                        await wait();
                        ctxA.signal(EXIT, node.systemPid, kill);
                        await wait();
                        expect(die).not.toHaveBeenCalled();
                    });
                });
                describe('when the process is alive', function () {
                    it('exits the process', async function () {
                        const die = jest.spyOn(ctxA, 'die');
                        ctxA.signal(EXIT, node.systemPid, kill);
                        await wait();
                        expect(die).toHaveBeenCalledWith(killed);
                    });
                });
            });
        });
    });

    describe('when linked', function () {
        it('can unlink if it created the link', async function () {
            ctxA.link(ctxB.self());
            await wait();
            expect(function () {
                ctxA.unlink(ctxB.self());
            }).not.toThrow();
            await wait();
            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [],
                [spread]: _
            });
        });
        it('will not add a duplicate link', async function () {
            ctxA.link(ctxB.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });
            expect(ctxB.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });

            ctxB.link(ctxA.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });
            expect(ctxB.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });

            ctxA.link(ctxB.self());
            await wait();

            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });
            expect(ctxB.processInfo(ctxA.self())).toMatchPattern({
                links: [_],
                [spread]: _
            });
        });
    });
});
