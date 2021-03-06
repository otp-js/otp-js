import * as core from '../src';
import { t, l } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import '@otpjs/test_utils';

function log(ctx, ...args) {
    return ctx.log.extend('core:__tests__')(...args);
}

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const { ok, normal, error, DOWN } = core.Symbols;
const { spread, _ } = matching.Symbols;
const test = Symbol.for('test');
const test_b = Symbol.for('test_b');

describe('@otpjs/core.Node', () => {
    let node = null;
    let proc = null;

    beforeEach(function () {
        node = new core.Node();
    });

    it('can create refs', function () {
        expect(node.ref).toBeInstanceOf(Function);
        const refA = node.ref();
        expect(core.Ref.isRef(refA)).toBe(true);
    });
    it('can spawn contexts (processes)', function () {
        proc = node.spawn(() => ({}));
        expect(proc).toBeInstanceOf(core.Pid);
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

        await wait(100);

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

        expect(await node.whereis(test)).toBe(pid);
        expect(await ctx.whereis(test)).toBe(pid);
        expect(await node.whereis(test_b)).toBe(undefined);
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

            await wait(10);

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

        await wait(10);

        expect(node.whereis(test)).not.toBeUndefined();
        node.deliver(proc, proc, 'stop');

        await wait(10);

        expect(node.whereis(test)).toBeUndefined();
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
            await wait(10);
            let result = new Promise((resolve) => {
                procB = node.spawn(async (ctx) => {
                    ref = ctx.monitor(procA);
                    ctx.send(procA, 'stop');
                    resolve(await ctx.receive());
                });
            });
            await expect(result).resolves.toMatchPattern(
                t(DOWN, ref, 'process', procA, normal)
            );
        });
    });
});

describe('@otpjs/core.Context', () => {
    let node;
    let ctxA;
    let ctxB;

    beforeEach(function () {
        node = new core.Node();
        ctxA = node.makeContext();
        ctxB = node.makeContext();
    });

    describe('when linked', function () {
        it('can unlink if it created the link', function () {
            ctxA.link(ctxB.self());
            expect(function () {
                ctxA.unlink(ctxB.self());
            }).not.toThrow();
            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [],
                [spread]: _,
            });
        });
    });
});
