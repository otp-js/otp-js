import * as core from '../src';
import "./extend"

async function wait(ms) {
    return new Promise(
        resolve => setTimeout(
            resolve,
            ms
        )
    );
}

describe('@otpjs/core.OTPNode', () => {
    let node = null;
    let proc = null;

    beforeEach(function() {
        node = new core.Node();
    });

    it('can create refs', function() {
        expect(node.ref).toBeInstanceOf(Function);
        const refA = node.ref();
        expect(core.Ref.isRef(refA)).toBe(true);
    });
    it('can spawn contexts (processes)', function() {
        proc = node.spawn(() => ({}));
        expect(proc).toBeInstanceOf(core.Pid);
    });
    it('can look up processes', function() {
        expect(node).toHaveProperty('processInfo');
        expect(node.processInfo).toBeInstanceOf(Function);

        proc = node.spawn(() => ({}));

        expect(node.processInfo(proc)).toBeInstanceOf(core.Context);
    });
    it('fails silently when a message is undeliverable', async function() {
        proc = node.spawn(async (ctx) => {
            // noop
        });

        await wait(100);

        expect(node.deliver).toBeInstanceOf(Function);
        expect(() => node.deliver(proc, 1)).not.toThrow();
    });
    it('can register contexts under names', async function() {
        expect(node.register).toBeInstanceOf(Function);
        const ctx = node.makeContext();
        expect(() => node.register(ctx, 'test')).not.toThrow();
    });
    it('can look up processes by their names', async function() {
        expect(node.whereis).toBeInstanceOf(Function);

        const pid = node.spawn(async (ctx) => {
            ctx.register('test');
            await ctx.receive();
        });
        const ctx = node.makeContext();

        expect(await node.whereis('test')).toBe(pid);
        expect(await ctx.whereis('test')).toBe(pid);
        expect(await node.whereis('test_b')).toBe(undefined);
    });
    it('only allows one process to register a name', async function() {
        const result = new Promise(async (resolve, reject) => {
            node.spawn(async (ctx) => {
                ctx.register('test');
                await ctx.receive();
            });
            node.spawn(async (ctx) => {
                try {
                    const result = ctx.register('test');
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
        });

        expect(result).rejects.toThrow(Error('badarg'));
    });
    it('can route messages to a name', async function() {
        const message = Math.floor(Math.random() * Number.MAX_VALUE);
        const result = await new Promise(async (resolve, reject) => {
            const pid = node.spawn(async ctx => {
                ctx.register('test');
                const result = await ctx.receive();
                resolve(result);
            });

            await wait(10);

            expect(node.whereis('test')).toBe(pid);
            expect(() => node.deliver('test', message)).not.toThrow();
        });

        expect(result).toBe(message);
    });
    it('unregisters contexts when they die', async function() {
        const proc = node.spawn(async (ctx) => {
            ctx.register('test');
            const message = await ctx.receive();
        });

        await wait(10);

        expect(node._registrations.has('test')).toBe(true);
        node.deliver(proc, 'stop');

        await wait(10);

        expect(node._registrations.has('test')).toBe(false);
    });

    describe('deliver', function() {
        it('can deliver local messages', function(done) {
            proc = node.spawn(async (ctx) => {
                const message = await ctx.receive();
                expect(message).toBe(1);
                done();
            });
            expect(node.deliver).toBeInstanceOf(Function);
            expect(() => node.deliver(proc, 1)).not.toThrow();
        });

        it('accepts remote pids', async function() {
            proc = core.Pid.of(1, 0);
            expect(() => node.deliver(proc, 1)).not.toThrow();
        });

        it('tries to route remote messages', function() {
            proc = core.Pid.of(1, 0);
            expect(() => node.deliver(proc, 'test')).not.toThrow();
        });
    });
});
