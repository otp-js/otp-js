import * as core from '../src';
import { t, l, Pid, Ref } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import '@otpjs/test_utils';

function log(ctx, ...args) {
    return ctx.log.extend('core:__tests__')(...args);
}

async function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const {
    ok,
    nodedown,
    normal,
    permanent,
    error,
    DOWN,
    kill,
    killed,
    badarg,
    link,
    EXIT,
    relay,
    trap_exit,
} = core.Symbols;
const { spread, _ } = matching.Symbols;
const test = Symbol.for('test');
const test_b = Symbol.for('test_b');

describe('@otpjs/core.Node', () => {
    let node = null;
    let proc = null;

    beforeEach(function () {
        node = new core.Node();
    });

    describe('has helpers', function () {
        describe('ref', function () {
            it('returns unique instances of Ref', function () {
                expect(node.ref).toBeInstanceOf(Function);
                const refA = node.ref();
                expect(core.Ref.isRef(refA)).toBe(true);
            });
        });
        describe('spawn', function () {
            it('returns a pid', function () {
                proc = node.spawn(() => ({}));
                expect(proc).toBeInstanceOf(core.Pid);
            });
            it('runs a given function', async function () {
                const runner = jest.fn();
                node.spawn(runner);
                await wait();
                expect(runner).toHaveBeenCalled();
            });
            it('passes a Context instance', async function () {
                const runner = jest.fn();
                node.spawn(runner);
                await wait();
                expect(runner.mock.calls[0][0]).toBeInstanceOf(core.Context);
            });
        });
        describe('spawnLink', function () {
            it('returns a pid', function () {
                const ctx = node.makeContext();
                proc = node.spawnLink(ctx.self(), () => ({}));
                expect(proc).toBeInstanceOf(core.Pid);
            });
            it('runs a given function', async function () {
                const ctx = node.makeContext();
                const runner = jest.fn();
                node.spawnLink(ctx.self(), runner);
                await wait();
                expect(runner).toHaveBeenCalled();
            });
            it('immediately links the new process with the passed one', async function () {
                const signal = jest.spyOn(node, 'signal');
                const ctx = node.makeContext();
                const runner = jest.fn((ctx) => ctx.receive());
                const spawned = node.spawnLink(ctx.self(), runner);
                await wait();
                expect(runner).toHaveBeenCalled();
                expect(signal).toHaveBeenCalledTimes(2);
                expect(node.processInfo(ctx.self())).toMatchPattern({
                    links: [spawned],
                    [spread]: _,
                });
                expect(signal.mock.calls[0]).toMatchPattern([
                    Pid.isPid,
                    link,
                    Pid.isPid,
                ]);
                expect(signal.mock.calls[1]).toMatchPattern([
                    Pid.isPid,
                    link,
                    Pid.isPid,
                ]);
            });
        });
        describe('spawnMonitor', function () {
            it('returns a pid', function () {
                const ctx = node.makeContext();
                proc = node.spawnMonitor(ctx.self(), () => ({}));
                expect(proc).toMatchPattern(t(Pid.isPid, Ref.isRef));
            });
            it('runs a given function', async function () {
                const ctx = node.makeContext();
                const runner = jest.fn();
                node.spawnMonitor(ctx.self(), runner);
                await wait();
                expect(runner).toHaveBeenCalled();
            });
            it('immediately links the new process with the passed one', async function () {
                const signal = jest.spyOn(node, 'signal');
                const ctx = node.makeContext();
                const runner = jest.fn((ctx) => ctx.receive());
                const [spawned, mref] = node.spawnMonitor(ctx.self(), runner);
                await wait();
                expect(runner).toHaveBeenCalled();
                expect(signal).toHaveBeenCalledTimes(1);
                expect(node.processInfo(spawned)).toMatchPattern({
                    monitors: [ctx.self()],
                    [spread]: _,
                });
            });
        });
        describe('getContext', function () {
            describe('when given a living process pid', function () {
                it('returns the context for that process', function () {
                    const ctx = node.makeContext();
                    expect(node.getContext(ctx.self())).toBe(ctx);
                });
            });
            describe('when given a dead process pid', function () {
                it('returns nothing', function () {
                    const fakePid = Pid.of(node.name, 999, 999, 999);
                    expect(node.getContext(fakePid)).toBeFalsy();
                });
            });
        });
        describe('exit', function () {
            it('emits an exit signal to the target process', async function () {
                const ctxA = node.makeContext();
                const ctxB = node.makeContext();

                ctxB.processFlag(trap_exit, true);

                node.exit(ctxA.self(), ctxB.self(), normal);
            });
        });
    });
    it('can look up processes', function () {
        expect(node).toHaveProperty('processInfo');
        expect(node.processInfo).toBeInstanceOf(Function);

        proc = node.spawn(() => ({}));

        expect(node.processInfo(proc)).toMatchPattern({
            [spread]: _,
        });
    });
    it('fails silently when a message is undeliverable', async function () {
        proc = node.spawn(async (ctx) => {
            // noop
        });

        await wait();

        expect(node.deliver).toBeInstanceOf(Function);
        expect(() => node.deliver(proc, proc, 1)).not.toThrow();
    });
    it('can register contexts under names', async function () {
        expect(node.register).toBeInstanceOf(Function);
        const ctx = node.makeContext();
        expect(() => node.register(ctx.self(), test)).not.toThrow();
    });
    it('can look up processes by their names', async function () {
        expect(node.whereis).toBeInstanceOf(Function);

        const pid = node.spawn(async (ctx) => {
            ctx.register(test);
            await ctx.receive();
        });
        const ctx = node.makeContext();

        await wait();

        expect(node.whereis(test)).toBe(pid);
        expect(ctx.whereis(test)).toBe(pid);
        expect(node.whereis(test_b)).toBe(undefined);
    });
    it('only allows one process to register a name', async function () {
        const pidA = node.spawn(async (ctx) => {
            try {
                ctx.register(test);
                await ctx.receive();
            } catch (err) {
                log(ctx, 'register(test) : error : %o', err);
            }
        });
        const result = new Promise(async (resolve, reject) => {
            node.spawn(async (ctx) => {
                try {
                    log(ctx, 'register(test)');
                    const result = ctx.register(test);
                    resolve(result);
                } catch (err) {
                    log(ctx, 'register(test) : error : %o', err);
                    reject(err);
                }
            });
        });

        await expect(result).rejects.toThrowTerm(core.Symbols.badarg);
        node.deliver(pidA, pidA, 'stop');
    });
    it('can route messages to a name', async function () {
        const message = Math.floor(Math.random() * Number.MAX_VALUE);
        const result = await new Promise(async (resolve, reject) => {
            const pid = node.spawn(async (ctx) => {
                ctx.register(test);
                const result = await ctx.receive();
                resolve(result);
            });

            await wait();

            expect(node.whereis(test)).toBe(pid);
            expect(() => node.deliver(pid, test, message)).not.toThrow();
        });

        expect(result).toBe(message);
    });
    it('unregisters contexts when they die', async function () {
        const proc = node.spawn(async (ctx) => {
            ctx.register(test);
            const message = await ctx.receive();
        });

        await wait();

        expect(node.whereis(test)).not.toBeUndefined();
        node.deliver(proc, proc, 'stop');

        await wait();

        expect(node.whereis(test)).toBeUndefined();
    });

    describe('link', function () {
        let ctxA;
        let ctxB;

        beforeEach(function () {
            ctxA = node.makeContext();
            ctxB = node.makeContext();
        });

        it('signals two processes to link', function () {
            const signal = jest.spyOn(node, 'signal');

            node.link(ctxA.self(), ctxB.self());

            expect(signal).toHaveBeenCalledTimes(2);
        });
        describe('linked processes', function () {
            beforeEach(function () {
                node.link(ctxA.self(), ctxB.self());
            });
            it('send exit signals on death', async function () {
                const signal = jest.spyOn(node, 'signal');
                node.exit(ctxA.self(), ctxB.self(), kill);
                await expect(ctxA.death).resolves.toBe(killed);
                await expect(ctxB.death).resolves.toBe(killed);
                expect(signal).toHaveBeenCalledTimes(3);
            });
        });
    });
    describe('unlink', function () {
        let ctxA;
        let ctxB;

        beforeEach(function () {
            ctxA = node.makeContext();
            ctxB = node.makeContext();
            node.link(ctxA.self(), ctxB.self());
        });

        it('signals two processes to unlink', function () {
            const signal = jest.spyOn(node, 'signal');
            node.unlink(ctxA.self(), ctxB.self());
            expect(signal).toHaveBeenCalledTimes(2);
        });

        describe('unlinked processes', function () {
            beforeEach(function () {
                node.unlink(ctxA.self(), ctxB.self());
            });
            it('no longer send exit signals on death', function () {
                const signal = jest.spyOn(node, 'signal');

                node.exit(ctxA.self(), ctxB.self(), kill);

                expect(signal).toHaveBeenCalledTimes(1);
                expect(node.processInfo(ctxB.self())).not.toBeUndefined();
            });
        });
    });
    describe('monitor', function () {
        let ctxA;
        let ctxB;

        beforeEach(function () {
            ctxA = node.makeContext();
            ctxB = node.makeContext();
        });

        it('signals to watch a process', function () {
            const signal = jest.spyOn(node, 'signal');

            node.monitor(ctxA.self(), ctxB.self());

            expect(signal).toHaveBeenCalledTimes(1);
        });

        describe('on a living process', function () {
            it('returns a ref for the monitor', function () {
                expect(node.monitor(ctxA.self(), ctxB.self())).toBeInstanceOf(
                    Ref
                );
            });
        });

        describe('on a dead process', function () {
            it('returns a ref', function () {
                const fakePid = Pid.of(0, 999, 999, 999);
                expect(node.monitor(ctxA.self(), fakePid)).toMatchPattern(
                    Ref.isRef
                );
            });

            it('immediately signals the monitoring process', async function () {
                const fakePid = Pid.of(0, 999, 999, 999);
                const ref = node.monitor(ctxA.self(), fakePid);

                await expect(ctxA.receive()).resolves.toMatchPattern(
                    t(DOWN, ref, 'process', fakePid, 'noproc')
                );
            });

            describe('when the monitoring process has died', function () {
                it('does not throw', function () {
                    const fakePidA = Pid.of(0, 999, 999, 999);
                    const fakePidB = Pid.of(0, 999, 999, 998);

                    expect(function () {
                        node.monitor(fakePidA, fakePidB);
                    }).not.toThrow();
                });
            });
        });
    });
    describe('demonitor', function () {
        let ctxA;
        let ctxB;
        let ref;

        beforeEach(function () {
            ctxA = node.makeContext();
            ctxB = node.makeContext();

            ref = node.monitor(ctxA.self(), ctxB.self());
        });

        it('ignores nonexistant monitors', function () {
            const signal = jest.spyOn(node, 'signal');
            const ref = node.ref();

            expect(node.demonitor(ctxA.self(), ref)).toMatchPattern(ok);
            expect(signal).toHaveBeenCalledTimes(0);
        });

        it('signals to stop watching a process', function () {
            const signal = jest.spyOn(node, 'signal');

            expect(node.demonitor(ctxA.self(), ref)).toMatchPattern(ok);
            expect(signal).toHaveBeenCalledTimes(1);
        });
    });
    describe('signal', function () {
        it('safely wraps errors', function () {
            expect(node.signal(null, null, null, null)).toMatchPattern(
                t(error, _)
            );
        });

        describe('with a pid', function () {
            describe('from a local node', function () {
                describe('for a living process', function () {
                    it('relays the message to the process', async function () {
                        const ctx = node.makeContext();
                        expect(
                            node.signal(null, relay, ctx.self(), 'test')
                        ).toBe(ok);
                        await expect(ctx.receive()).resolves.toBe('test');
                    });
                });
                describe('for a dead process', function () {
                    it('responds with a noproc error', function () {
                        const fakePid = Pid.of(0, 999, 999, 999);
                        expect(
                            node.signal(null, relay, fakePid, 'test')
                        ).toMatchPattern(t(error, 'noproc'));
                    });
                });
            });
            describe('from a remote node', function () {
                describe('with an active router', function () {
                    let ctx;
                    let nodeName;

                    beforeEach(function () {
                        nodeName = Symbol.for('noone@nowhere');
                        ctx = node.makeContext();
                        node.registerRouter(null, 0, nodeName, ctx.self(), {});
                    });

                    it('relays the message via the router', async function () {
                        const fakePid = Pid.of(1, 999, 999, 999);

                        expect(
                            node.signal(null, relay, fakePid, 'test')
                        ).toMatchPattern(ok);

                        const message = await ctx.receive();
                        await expect(message).toMatchPattern(
                            t(relay, t(relay, null, fakePid, 'test'))
                        );
                    });
                });
                describe('without an active router', function () {
                    it('returns a noconnection error', function () {
                        const fakePid = Pid.of(1, 999, 999, 999);

                        expect(
                            node.signal(null, relay, fakePid, 'test')
                        ).toMatchPattern(t(error, 'noconnection'));
                    });
                });
            });
        });
        describe('with a name/node pair', function () {
            describe('to a remote node', function () {
                describe('which is known', function () {
                    let ctx;
                    let nodeName;

                    beforeEach(function () {
                        nodeName = Symbol.for('noone@nowhere');
                        ctx = node.makeContext();
                        node.registerRouter(null, 0, nodeName, ctx.self(), {});
                    });

                    it('relays the signal to the registered proces', function () {
                        const fakeProcess = Symbol.for('fake_name');
                        const ctxB = node.makeContext();
                        expect(node.nodes()).toContain(nodeName);

                        expect(
                            node.signal(
                                ctxB.self(),
                                relay,
                                t(fakeProcess, nodeName),
                                'test_message'
                            )
                        ).toMatchPattern(ok);
                    });
                });
                describe('which is unknown', function () {
                    let nodeName;

                    beforeEach(function () {
                        nodeName = Symbol.for('noone@nowhere');
                    });

                    it('relays the signal to the registered proces', function () {
                        const fakeProcess = Symbol.for('fake_name');
                        const ctxB = node.makeContext();
                        expect(node.nodes()).not.toContain(nodeName);

                        expect(
                            node.signal(
                                ctxB.self(),
                                relay,
                                t(fakeProcess, nodeName),
                                'test_message'
                            )
                        ).toMatchPattern(t(error, 'noconnection'));
                    });
                });
            });
        });
    });
    describe('node', function () {
        describe('with no argument', function () {
            it('returns the name of the current node', function () {
                expect(node.node()).toBe(node.name);
            });
        });

        describe('given a pid', function () {
            it('returns the name of the node the pid comes from', async function () {
                let unregister, spawn;

                const unregistered = new Promise(
                    (resolve) => (unregister = resolve)
                );
                const spawned = new Promise((resolve) => (spawn = resolve));

                const nodeName = Symbol.for('monitor@test');
                await node.spawn(async (ctx) => {
                    const id = node.registerRouter(
                        null,
                        0,
                        nodeName,
                        ctx.self()
                    );
                    spawn(id);
                    await unregistered;
                    node.unregisterRouter(ctx.self());
                    return ok;
                });

                const id = await spawned;
                const pid = Pid.of(id, 0, 1, 0);

                expect(node.node(pid)).toBe(nodeName);
                unregister();
            });
        });
    });
    describe('nodes', function () {
        describe('with no nodes registered', function () {
            it('returns a list with only the host node', function () {
                expect(node.nodes()).toMatchPattern(l(node.name));
            });
        });
        describe('with a remote node registered', function () {
            it('returns a list with all node names', function () {
                const ctx = node.makeContext();
                const remoteNodeName = Symbol.for('test2@127.0.0.1');
                node.registerRouter(null, 0, remoteNodeName, ctx.self(), {});
                expect(node.nodes()).toMatchPattern(
                    l(node.name, remoteNodeName)
                );
            });
            describe('which has died', function () {
                it('ignores the dead node', async function () {
                    const ctx = node.makeContext();
                    const remoteNode = Symbol.for('noone@nowhere');
                    let pid;
                    const promise = new Promise((resolve, reject) => {
                        pid = node.spawn(async (ctx) => {
                            resolve(ctx.death);
                            node.registerRouter(
                                null,
                                0,
                                remoteNode,
                                ctx.self(),
                                { type: permanent }
                            );
                            await ctx.receive();
                            await node.unregisterRouter(ctx.self());
                            return ok;
                        });
                    });

                    await wait(1);

                    expect(node.nodes()).toMatchPattern(
                        l(node.name, remoteNode)
                    );
                    expect(pid).toBeInstanceOf(Pid);
                    ctx.send(pid, ok);

                    await promise;
                    await wait();

                    expect(node.processInfo(pid)).toBeUndefined();
                    expect(node.nodes()).toMatchPattern(l(node.name));
                });
            });
        });
    });
    describe('deliver', function () {
        const procName = Symbol.for('process');
        it('can deliver local messages', function (done) {
            proc = node.spawn(async (ctx) => {
                const message = await ctx.receive();
                expect(message).toBe(1);
                done();
            });
            expect(node.deliver).toBeInstanceOf(Function);
            expect(() => node.deliver(proc, proc, 1)).not.toThrow();
        });

        it('accepts remote pids', async function () {
            proc = core.Pid.of(1, 0);
            expect(() => node.deliver(proc, proc, 1)).not.toThrow();
        });

        it('tries to route remote messages', function () {
            proc = core.Pid.of(1, 0);
            expect(() => node.deliver(proc, proc, test)).not.toThrow();

            expect(() =>
                node.deliver(proc, t(procName, node.name), test)
            ).not.toThrow();
        });

        it('can deliver to registered processes', async function () {
            let done;
            let promise = new Promise((resolve) => (done = resolve));
            const pid = node.spawn(async (ctx) => {
                await ctx.register(procName);
                const message = await ctx.receive();
                expect(message).toBe(1);
                done(true);
            });

            await wait(10);
            expect(() => node.deliver(pid, procName, 1)).not.toThrow();
            await expect(promise).resolves.toBe(true);
        });

        it('can deliver to name/node pairs', async function () {
            let done;
            let promise = new Promise((resolve) => (done = resolve));

            const pid = node.spawn(async (ctx) => {
                await ctx.register(procName);
                const message = await ctx.receive();
                expect(message).toBe(1);
                done(true);
            });
            await wait();
            expect(() =>
                node.deliver(pid, t(procName, node.name), 1)
            ).not.toThrow();

            await expect(promise).resolves.toBe(true);
        });
    });
    describe('monitor', function () {
        let procA;
        let procB;

        it('sends a message to watcher when watchee dies', async function () {
            let ref;
            procA = node.spawn(async (ctx) => {
                await ctx.receive();
            });
            await wait();
            let result = new Promise((resolve) => {
                procB = node.spawn(async (ctx) => {
                    ref = ctx.monitor(procA);
                    ctx.send(procA, 'stop');
                    resolve(await ctx.receive());
                });
            });
            await wait();
            await expect(result).resolves.toMatchPattern(
                t(DOWN, ref, 'process', procA, normal)
            );
        });
    });
    describe('monitorNode', function () {
        describe('without a registered node', function () {
            it('immediately sends a nodedown signal to the calling process', async function () {
                const nodeName = Symbol.for('noone@nowhere');
                const promise = new Promise((resolve, reject) => {
                    node.spawn(async (ctx) => {
                        ctx.monitorNode(nodeName);
                        resolve(await ctx.receive());
                    });
                });

                await expect(promise).resolves.toMatchPattern(
                    t(nodedown, nodeName)
                );
            });
        });

        describe('with a registered node', function () {
            it('notifies the caller if the node unregisters', async function () {
                let register, unregister, receive;

                const registered = new Promise(
                    (resolve) => (register = resolve)
                );
                const received = new Promise((resolve) => (receive = resolve));
                const unregistered = new Promise(
                    (resolve) => (unregister = resolve)
                );

                const nodeName = Symbol.for('monitor@test');
                await node.spawn(async (ctx) => {
                    node.registerRouter(null, 0, nodeName, ctx.self());
                    register();
                    await unregistered;
                    node.unregisterRouter(ctx.self());
                    return ok;
                });
                await node.spawn(async (ctx) => {
                    await registered;
                    ctx.monitorNode(nodeName);
                    receive(await ctx.receive());
                });

                await wait();

                expect(Array.from(node.nodes())).toContain(nodeName);
                unregister();

                await wait();

                expect(Array.from(node.nodes())).not.toContain(nodeName);
                expect(received).resolves.toMatchPattern(t(nodedown, nodeName));
            });
        });
    });
    describe('register', function () {
        let ctx;
        beforeEach(function () {
            ctx = node.makeContext();
        });
        it('only registers atoms/symbols', function () {
            const tryRegister = (name) => () => node.register(ctx.self(), name);

            expect(tryRegister(1)).toThrowTerm(badarg);
            expect(tryRegister('string')).toThrowTerm(badarg);
            expect(tryRegister({})).toThrowTerm(badarg);
            expect(tryRegister(null)).toThrowTerm(badarg);
            expect(tryRegister(undefined)).toThrowTerm(badarg);
            expect(tryRegister(Symbol())).not.toThrow();
            expect(tryRegister(Symbol.for('test'))).not.toThrow();
        });
        it('only registers living processes', function () {
            const fakePid = Pid.of(0, 999, 999, 999);
            expect(() =>
                node.register(fakePid, Symbol.for('test'))
            ).toThrowTerm(badarg);
        });
        it('associates the name with that process for signals', async function () {
            const ctxB = node.makeContext();
            const name = Symbol.for('name');

            node.register(ctx.self(), name);

            expect(() => ctxB.send(name, 'test')).not.toThrow();
            await expect(ctx.receive()).resolves.toBe('test');
        });
    });
    describe('unregister', function () {
        let ctx;
        let name;

        beforeEach(function () {
            name = Symbol.for('test');
            ctx = node.makeContext();
            node.register(ctx.self(), name);
        });

        describe('when not given a name to unregister', function () {
            it('unregisters all names for that process', function () {
                const secondName = Symbol.for('second_test');
                node.register(ctx.self(), secondName);

                expect(node.unregister(ctx.self())).toBe(ok);
                expect(node.whereis(secondName)).toBeUndefined();
                expect(node.whereis(name)).toBeUndefined();
            });
        });

        describe('when given a name to unregister', function () {
            describe('and that name is registered', function () {
                it('removes the registration', function () {
                    node.unregister(ctx.self(), name);
                    expect(node.whereis(name)).toBeUndefined();
                });
                it('does not remove other registrations', function () {
                    const secondName = Symbol.for('second_test');
                    node.register(ctx.self(), secondName);
                    node.unregister(ctx.self(), name);
                    expect(node.whereis(name)).toBeUndefined();
                    expect(node.whereis(secondName)).toMatchPattern(ctx.self());
                });
            });

            describe('and that name is not registered', function () {
                it('is ok', function () {
                    const secondName = Symbol.for('second_test');
                    expect(node.unregister(ctx.self(), secondName)).toBe(ok);
                });
            });
        });
    });
});
