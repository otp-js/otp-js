/* eslint-env jest */
import '@otpjs/test_utils';
import * as otp from '@otpjs/core';
import { OTPError, Pid, Ref, t, l } from '@otpjs/types';
import * as match from '@otpjs/matching';
import { createServer } from 'http';
import io from 'socket.io';
import clientIO from 'socket.io-client';

import { register as useSocketIO } from '../src';

const { _, spread } = match.Symbols;
const { ok, DOWN, error, kill, killed, normal, timeout } = otp.Symbols;
const test_name = Symbol.for('test');

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io:__tests__')(...args);
}

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

let serverNode = null;
let clientNode = null;
let server = null;
let serverManager = null;
let serverSocket = null;
let clientSocket = null;

beforeEach(async function () {
    serverNode = new otp.Node();
    clientNode = new otp.Node();

    server = createServer();
    server.listen(0);
    serverManager = io(server);

    const loadServerSocket = new Promise((resolve, _reject) => {
        serverManager.once('connection', resolve);
    });

    const port = server.address().port;
    clientSocket = clientIO(`http://localhost:${port}`);

    serverSocket = await loadServerSocket;
});

afterEach(function () {
    serverSocket.disconnect();
    serverSocket = null;

    clientSocket.disconnect();
    clientSocket = null;

    server.close();
    server = null;
    serverManager = null;

    serverNode = null;
    clientNode = null;
});

describe('@otpjs/transports-socket.io', function () {
    it('can register from both sides', async function () {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        expect(Array.from(serverNode.nodes())).toContain(clientNode.name);
        expect(Array.from(clientNode.nodes())).toContain(serverNode.name);
    });
    it('can route to named remote processes', async function () {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        let pid;
        await new Promise(async (resolve, reject) => {
            serverNode.spawn(async (ctx) => {
                try {
                    log(ctx, 'spawned');
                    ctx.register(test_name);
                    const message = await ctx.receive(500);
                    expect(message).toBe('test');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            await wait(100);

            pid = clientNode.spawn(async (ctx) => {
                const target = t(test_name, serverNode.name);
                log(ctx, 'send(%o, test)', target);
                ctx.send(target, 'test');
                await wait(100);
            });
        });

        clientNode.deliver(clientNode.system, pid, 'die');
    });
    it('supports monitoring over the transport', async function () {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        const pidA = serverNode.spawn(async (ctx) => {
            ctx.register(test_name);
            await ctx.receive();
            log(ctx, 'received : stopping');
        });

        await wait(100);

        let mref, pidB;
        await expect(
            new Promise((resolve, reject) => {
                pidB = clientNode.spawn(async (ctx) => {
                    mref = ctx.monitor(t(test_name, serverNode.name));
                    ctx.send(t(test_name, serverNode.name), 'stop');
                    resolve(await ctx.receive());
                });
            })
        ).resolves.toMatchPattern(
            t(DOWN, Ref.isRef, 'process', Pid.isPid, normal)
        );
    });
    it('supports demonitoring over the transport', async function () {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        const pidA = serverNode.spawn(async (ctx) => {
            ctx.register(test_name);
            await ctx.receive();
            log(ctx, 'received : stopping');
        });

        await wait(100);
        const ctx = clientNode.makeContext();
        const mref = ctx.monitor(t(test_name, serverNode.name));
        expect(function () {
            ctx.demonitor(mref);
        }).not.toThrow();
        await wait(100);

        ctx.send(t(test_name, serverNode.name), 'die');
        await expect(ctx.receive(100)).rejects.toThrow('timeout');
    });
    it('can be unregistered', async function () {
        const destroyClient = useSocketIO(clientNode, clientSocket);
        const destroyServer = useSocketIO(serverNode, serverSocket);

        await wait(100);

        expect(Array.from(serverNode.nodes())).toContain(clientNode.name);
        expect(Array.from(clientNode.nodes())).toContain(serverNode.name);

        destroyClient();
        destroyServer();

        await wait(100);

        expect(Array.from(serverNode.nodes())).not.toContain(clientNode.name);
        expect(Array.from(clientNode.nodes())).not.toContain(serverNode.name);
    });
    describe('when bridged over another node', function () {
        let clientNodeB, clientSocketB, serverSocketB;
        let destroyClientA, destroyServerA, destroyClientB, destroyServerB;

        beforeEach(async function () {
            const loadServerSocket = new Promise((resolve, reject) => {
                serverManager.once('connection', resolve);
            });

            clientNodeB = new otp.Node();
            const port = server.address().port;
            clientSocketB = clientIO(`http://localhost:${port}`);
            serverSocketB = await loadServerSocket;

            destroyClientA = useSocketIO(clientNode, clientSocket, {
                bridge: true
            });
            destroyServerA = useSocketIO(serverNode, serverSocket, {
                bridge: true
            });

            destroyClientB = useSocketIO(clientNodeB, clientSocketB, {
                bridge: true
            });
            destroyServerB = useSocketIO(serverNode, serverSocketB, {
                bridge: true
            });

            await wait(100);
        });

        afterEach(function () {
            if (clientSocketB.connected) {
                clientSocketB.disconnect();
            }

            destroyClientA?.();
            destroyServerA?.();
            destroyClientB?.();
            destroyServerB?.();
        });

        it('can route messages', async function () {
            const payload = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const resultA = new Promise((resolve, reject) => {
                clientNode.spawn(async (ctx) => {
                    ctx.register(test_name);
                    const [message, from] = await ctx.receive();
                    ctx.send(from, 'received');
                    resolve(message);
                });
            });

            await wait(100);

            clientNodeB.spawn(async (ctx) => {
                ctx.send(
                    t(test_name, clientNode.node()),
                    t(payload, ctx.self())
                );
                await expect(ctx.receive()).resolves.toBe('received');
            });

            await expect(resultA).resolves.toBe(payload);
        });

        describe('when disconnected', function () {
            it('gets removed from others\' node lists', async function () {
                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();

                expect(Array.from(ctxA.nodes())).toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).toContain(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(100);

                log(ctxA, 'testA(nodes: %o)', Array.from(ctxA.nodes()));
                log(ctxB, 'testB(nodes: %o)', Array.from(ctxB.nodes()));

                expect(Array.from(ctxA.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxA.node());

                ctxA.exit(ctxA.self(), kill);
                ctxB.exit(ctxB.self(), kill);
            });

            it('is not discovered by new nodes', async function () {
                const port = server.address().port;
                const clientNodeC = new otp.Node();

                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();
                const ctxC = clientNodeC.makeContext();

                await wait(100);

                expect(Array.from(ctxA.nodes())).toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).toContain(ctxA.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(100);

                log(ctxA, 'testA(nodes: %o)', Array.from(ctxA.nodes()));
                log(ctxB, 'testB(nodes: %o)', Array.from(ctxB.nodes()));

                expect(Array.from(ctxA.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxA.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxA.node());

                const clientSocketC = clientIO(`http://localhost:${port}`);
                const loadServerSocket = new Promise((resolve, reject) => {
                    serverManager.once('connection', resolve);
                });
                const serverSocketC = await loadServerSocket;

                const destroyClientC = useSocketIO(clientNodeC, clientSocketC, {
                    bridge: true
                });
                const destroyServerC = useSocketIO(serverNode, serverSocketC, {
                    bridge: true
                });

                await wait(100);
                expect(Array.from(ctxA.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxA.nodes())).toContain(ctxC.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxA.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxC.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxC.nodes())).toContain(ctxA.node());

                ctxA.exit(ctxA.self(), kill);
                ctxB.exit(ctxB.self(), kill);
                ctxC.exit(ctxC.self(), kill);

                destroyServerC();
                destroyClientC();
            });
        });
    });
    describe('supports signal federation', function () {
        const serverName = Symbol.for('server');
        const clientName = Symbol.for('client');
        let clientCtx;
        let serverCtx;
        let destroyClient;
        let destroyServer;

        beforeEach(async function () {
            clientCtx = clientNode.makeContext();
            clientCtx.register(clientName);

            serverCtx = serverNode.makeContext();
            serverCtx.register(serverName);

            destroyClient = useSocketIO(clientNode, clientSocket);
            destroyServer = useSocketIO(serverNode, serverSocket);

            await wait(100);
        });

        afterEach(function () {
            destroyClient();
            destroyServer();
        });

        describe('given a relay signal', function () {
            it('passes the signal to the remote node', async function () {
                const buildBlock = (given, after) => {
                    given(_).then((incoming) => {
                        expect(incoming).toBe(message);
                        return ok;
                    });
                    after(2000).then(() => {
                        throw OTPError(otp.Symbols.timeout);
                    });
                };

                const message = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

                clientCtx.send(t(serverName, serverNode.name), message);
                await expect(serverCtx.receiveBlock(buildBlock)).resolves.toBe(ok);

                serverCtx.send(t(clientName, clientNode.name), message);
                await expect(clientCtx.receiveBlock(buildBlock)).resolves.toBe(ok);
            });
            describe('with buffer types', function () {
                let buffA, buffB;
                beforeEach(function () {
                    buffA = Buffer.from(
                        'buffer A is a Buffer instance, which is a view of an ArrayBuffer',
                        'utf8'
                    );
                    buffB = Buffer.from('buffer B is a small ArrayBuffer', 'utf8');
                });
                it('sends them seperately', async function () {
                    const name = Symbol.for('receiver');
                    const listener = jest.fn(function (
                        fromPid,
                        toPid,
                        message,
                        ...buffers
                    ) {
                        log(clientCtx, 'transportSocketIO(buffers: %o)', buffers);
                        expect(buffers.length).toBe(2);
                    });

                    clientSocket.on('otp-message', listener);
                    await wait(100);

                    clientNode.spawn(async (ctx) => {
                        ctx.register(name);
                        await ctx.receive();
                    });
                    serverNode.spawn(async (ctx) => {
                        while (!ctx.nodes().includes(clientNode.name)) { await wait(100); }
                        await ctx.send(
                            t(name, clientNode.name),
                            t(ok, buffA, {
                                make: {
                                    one: { deeply: { nested: l(t(ok, buffB)) } }
                                }
                            })
                        );
                    });

                    await wait(100);

                    expect(listener).toHaveBeenCalled();
                });
            });
        });

        describe('given a link signal', function () {
            it('passes the signal to the remote node', async function () {
                serverCtx.send(t(clientName, clientNode.name), serverCtx.self());
                const pid = await clientCtx.receive(Pid.isPid);
                clientCtx.link(pid);

                await wait(100);

                const clientInfo = clientCtx.processInfo(clientCtx.self());
                expect(clientInfo).toMatchPattern({
                    links: [_],
                    [spread]: _
                });

                const [remotePid] = clientInfo.links;
                expect(remotePid).toBeInstanceOf(Pid);
                expect(clientCtx.node(remotePid)).toBe(serverNode.name);
            });
        });
        describe('given an unlink signal', function () {
            it('passes the signal to the remote node', async function () {
                serverCtx.send(t(clientName, clientNode.name), serverCtx.self());

                const pid = await clientCtx.receive(Pid.isPid);
                log(clientCtx, 'unlink(received_pid: %o)', pid);
                clientCtx.link(pid);

                await wait(100);

                const clientInfoA = clientCtx.processInfo(clientCtx.self());
                expect(clientInfoA).toMatchPattern({
                    links: [_],
                    [spread]: _
                });

                const serverInfoA = serverCtx.processInfo(serverCtx.self());
                expect(serverInfoA).toMatchPattern({
                    links: [_],
                    [spread]: _
                });

                log(clientCtx, 'unlink(linked)');

                clientCtx.unlink(pid);
                await wait(100);

                log(clientCtx, 'unlink(unlinked)');

                const clientInfoB = clientCtx.processInfo(clientCtx.self());
                expect(clientInfoB).toMatchPattern({
                    links: [],
                    [spread]: _
                });
                const serverInfoB = serverCtx.processInfo(serverCtx.self());
                expect(serverInfoB).toMatchPattern({
                    links: [],
                    [spread]: _
                });
            });
        });
        describe('given an exit signal', function () {
            it('passes the signal to the remote node', async function () {
                serverCtx.send(t(clientName, clientNode.name), serverCtx.self());

                const pid = await clientCtx.receive(Pid.isPid);
                clientCtx.exit(pid, kill);

                await wait(100);

                expect(serverCtx.processInfo(serverCtx.self())).toBeUndefined();
                await expect(serverCtx.death).resolves.toBe(killed);
            });
        });
    });
    describe('when destroyed', function () {
        const serverName = Symbol.for('server');
        const clientName = Symbol.for('client');
        let clientCtx;
        let serverCtx;
        let destroyClient;
        let destroyServer;

        beforeEach(async function () {
            clientCtx = clientNode.makeContext();
            clientCtx.register(clientName);

            serverCtx = serverNode.makeContext();
            serverCtx.register(serverName);

            destroyClient = useSocketIO(clientNode, clientSocket);
            destroyServer = useSocketIO(serverNode, serverSocket);

            await wait(100);
        });

        afterEach(function () {
            try {
                destroyClient();
                /* eslint-disable-next-line no-empty */
            } finally {}

            try {
                destroyServer();
                /* eslint-disable-next-line no-empty */
            } finally {}
        });

        it('stops federating signals', async function () {
            serverCtx.send(t(clientName, clientNode.name), serverCtx.self());
            const pid = await clientCtx.receive(Pid.isPid);

            expect(destroyClient).not.toThrow();

            await wait(100);

            expect(clientSocket.connected).toBe(false);
            expect(serverSocket.connected).toBe(false);
            expect(clientCtx.send(pid, 'message')).toBe(ok);
            expect(serverCtx.receive(_, 500)).rejects.toThrowTerm(timeout);
        });
    });
});
