import '@otpjs/test_utils';
import { Pid, t, l } from '@otpjs/types';
import { createServer } from 'http';
import io from 'socket.io';
import clientIO from 'socket.io-client';

import { register as useSocketIO } from '../src';
import * as otp from '@otpjs/core';

const { DOWN, kill, normal } = otp.Symbols;
const test_name = Symbol.for('test');

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io:__tests__')(...args);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    const loadServerSocket = new Promise((resolve, reject) => {
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
    it('can register from the both sides', async function () {
        useSocketIO(clientNode, clientSocket, 'server');
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

        let pidA = serverNode.spawn(async (ctx) => {
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
        ).resolves.toMatchPattern(t(DOWN, mref, 'process', Pid.isPid, normal));
    });
    it('supports demonitoring over the transport', async function () {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        let pidA = serverNode.spawn(async (ctx) => {
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
                bridge: true,
            });
            destroyServerA = useSocketIO(serverNode, serverSocket, {
                bridge: true,
            });

            destroyClientB = useSocketIO(clientNodeB, clientSocketB, {
                bridge: true,
            });
            destroyServerB = useSocketIO(serverNode, serverSocketB, {
                bridge: true,
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
            let resultA = new Promise((resolve, reject) => {
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
            it("gets removed from others' node lists", async function () {
                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();

                expect(Array.from(ctxA.nodes())).toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).toContain(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(500);

                log(ctxA, 'testA(nodes: %o)', Array.from(ctxA.nodes()));
                log(ctxB, 'testB(nodes: %o)', Array.from(ctxB.nodes()));

                expect(Array.from(ctxA.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxA.node());

                ctxA.exit(kill);
                ctxB.exit(kill);
            });

            it('is not discovered by new nodes', async function () {
                const port = server.address().port;
                const clientNodeC = new otp.Node();

                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();
                const ctxC = clientNodeC.makeContext();

                await wait(500);

                expect(Array.from(ctxA.nodes())).toContain(ctxB.node());
                expect(Array.from(ctxB.nodes())).toContain(ctxA.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(500);

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
                    bridge: true,
                });
                const destroyServerC = useSocketIO(serverNode, serverSocketC, {
                    bridge: true,
                });

                await wait(500);
                expect(Array.from(ctxA.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxA.nodes())).toContain(ctxC.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxA.node());
                expect(Array.from(ctxB.nodes())).not.toContain(ctxC.node());
                expect(Array.from(ctxC.nodes())).not.toContain(ctxB.node());
                expect(Array.from(ctxC.nodes())).toContain(ctxA.node());

                ctxA.exit(kill);
                ctxB.exit(kill);
                ctxC.exit(kill);

                destroyServerC();
                destroyClientC();
            });
        });
    });
});
