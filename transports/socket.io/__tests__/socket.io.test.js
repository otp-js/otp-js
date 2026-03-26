/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import debug from 'debug';
import * as otp from '@otpjs/core';
import * as match from '@otpjs/matching';
import { l, OTPError, Pid, Ref, t } from '@otpjs/types';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import ClientIO from 'socket.io-client';

import { register as useSocketIO } from '../lib/index.js';

const { _, spread } = match.Symbols;
const { ok, DOWN, error, kill, killed, normal, timeout } = otp.Symbols;
const test_name = Symbol.for('test');

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io:__tests__')(...args);
}

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const blog = debug('otp:transports:socket.io:test')

let serverNode = null;
let clientNode = null;
let server = null;
let serverManager = null;
let serverSocket = null;
let clientSocket = null;

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

beforeEach(async function() {
    serverNode = new otp.Node();
    clientNode = new otp.Node();

    blog('beforeEach(created_nodes)')

    server = createServer();
    serverManager = new SocketIO();
    const loadServerSocket = new Promise((resolve, reject) => {
        server.on('error', (err) => {
            log('serverManager.error: %o', err)
            reject(err);
        });
        serverManager.on('connection', socket => {
            blog('beforeEach(connection_received, socket: %o)', socket);
            resolve(socket)
        });
    });
    serverManager.attach(server);
    server.listen(3000)

    blog('beforeEach(created_server)')


    await new Promise((resolve) => server.on('listening', resolve));

    blog('beforeEach(server_listening)')

    const port = server.address().port;
    clientSocket = ClientIO(`http://127.0.0.1:${port}`);
    clientSocket.on('error', (err) => {
        blog('serverManager.error: %o', err);
    })
    clientSocket.connect();

    blog('beforeEach(created_client, server_port: %o)', port)

    serverSocket = await loadServerSocket;

    blog('beforeEach(connection_established)')
});

afterEach(function() {
    serverSocket?.disconnect();
    serverSocket = null;

    clientSocket?.disconnect();
    clientSocket = null;

    server.close();
    server = null;
    serverManager = null;

    serverNode = null;
    clientNode = null;

    sinon.restore();
});

describe('@otpjs/transports-socket.io', function() {
    it('can register from both sides', async function() {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

        await wait(100);

        expect(Array.from(serverNode.nodes())).to.include(clientNode.name);
        expect(Array.from(clientNode.nodes())).to.include(serverNode.name);
    });
    it('can route to named remote processes', async function() {
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
                    expect(message).to.equal('test');
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
    it('supports monitoring over the transport', async function() {
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
        ).to.eventually.matchPattern(
            t(DOWN, Ref.isRef, 'process', Pid.isPid, normal)
        );
    });
    it('supports demonitoring over the transport', async function() {
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
        expect(function() {
            ctx.demonitor(mref);
        }).not.to.throw();
        await wait(100);

        ctx.send(t(test_name, serverNode.name), 'die');
        await expect(ctx.receive(100)).to.be.rejectedWith('timeout');
    });
    it('can be unregistered', async function() {
        const destroyClient = useSocketIO(clientNode, clientSocket);
        const destroyServer = useSocketIO(serverNode, serverSocket);

        await wait(100);

        expect(Array.from(serverNode.nodes())).to.include(clientNode.name);
        expect(Array.from(clientNode.nodes())).to.include(serverNode.name);

        destroyClient();
        destroyServer();

        await wait(100);

        expect(Array.from(serverNode.nodes())).not.to.include(clientNode.name);
        expect(Array.from(clientNode.nodes())).not.to.include(serverNode.name);
    });
    describe('when bridged over another node', function() {
        let clientNodeB, clientSocketB, serverSocketB;
        let destroyClientA, destroyServerA, destroyClientB, destroyServerB;

        beforeEach(async function() {
            const loadServerSocket = new Promise((resolve) => {
                serverManager.once('connection', resolve);
            });

            clientNodeB = new otp.Node();
            const port = server.address().port;
            clientSocketB = ClientIO(`http://localhost:${port}`);
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

        afterEach(function() {
            if (clientSocketB.connected) {
                clientSocketB.disconnect();
            }

            destroyClientA?.();
            destroyServerA?.();
            destroyClientB?.();
            destroyServerB?.();
        });

        it('can route messages', async function() {
            const payload = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            const resultA = new Promise((resolve) => {
                clientNode.spawn(async (ctx) => {
                    ctx.register(test_name);
                    const [message, from, _tag] = await ctx.receive();
                    ctx.send(from, 'received');
                    resolve(message);
                });
            });

            await wait(100);

            clientNodeB.spawn(async (ctx) => {
                ctx.send(
                    t(test_name, clientNode.name),
                    t(payload, ctx.self(), 'it can route messages')
                );
                await expect(ctx.receive()).to.eventually.equal('received');
            });

            await expect(resultA).to.eventually.equal(payload);
        });

        describe('when disconnected', function() {
            it("gets removed from others' node lists", async function() {
                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();

                expect(Array.from(ctxA.nodes())).to.include(ctxB.node());
                expect(Array.from(ctxB.nodes())).to.include(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(100);

                log(ctxA, 'testA(nodes: %o)', Array.from(ctxA.nodes()));
                log(ctxB, 'testB(nodes: %o)', Array.from(ctxB.nodes()));

                expect(Array.from(ctxA.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxB.nodes())).not.to.include(ctxA.node());

                ctxA.exit(ctxA.self(), kill);
                ctxB.exit(ctxB.self(), kill);
            });

            it('is not discovered by new nodes', async function() {
                const port = server.address().port;
                const clientNodeC = new otp.Node();

                const ctxA = clientNode.makeContext();
                const ctxB = clientNodeB.makeContext();
                const ctxC = clientNodeC.makeContext();

                await wait(100);

                expect(Array.from(ctxA.nodes())).to.include(ctxB.node());
                expect(Array.from(ctxB.nodes())).to.include(ctxA.node());
                expect(Array.from(ctxC.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxC.nodes())).not.to.include(ctxA.node());

                destroyClientB();
                destroyClientB = null;

                await wait(100);

                log(ctxA, 'testA(nodes: %o)', Array.from(ctxA.nodes()));
                log(ctxB, 'testB(nodes: %o)', Array.from(ctxB.nodes()));

                expect(Array.from(ctxA.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxB.nodes())).not.to.include(ctxA.node());
                expect(Array.from(ctxC.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxC.nodes())).not.to.include(ctxA.node());

                const clientSocketC = ClientIO(`http://localhost:${port}`);
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

                await wait(100);
                expect(Array.from(ctxA.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxA.nodes())).to.include(ctxC.node());
                expect(Array.from(ctxB.nodes())).not.to.include(ctxA.node());
                expect(Array.from(ctxB.nodes())).not.to.include(ctxC.node());
                expect(Array.from(ctxC.nodes())).not.to.include(ctxB.node());
                expect(Array.from(ctxC.nodes())).to.include(ctxA.node());

                ctxA.exit(ctxA.self(), kill);
                ctxB.exit(ctxB.self(), kill);
                ctxC.exit(ctxC.self(), kill);

                destroyServerC();
                destroyClientC();
            });
        });
    });
    describe('supports signal federation', function() {
        const serverName = Symbol.for('server');
        const clientName = Symbol.for('client');
        let clientCtx;
        let serverCtx;
        let destroyClient;
        let destroyServer;

        beforeEach(async function() {
            clientCtx = clientNode.makeContext();
            clientCtx.register(clientName);

            serverCtx = serverNode.makeContext();
            serverCtx.register(serverName);

            destroyClient = useSocketIO(clientNode, clientSocket);
            destroyServer = useSocketIO(serverNode, serverSocket);

            await wait(100);
        });

        afterEach(function() {
            destroyClient();
            destroyServer();
        });

        describe('given a relay signal', function() {
            it('passes the signal to the remote node', async function() {
                const buildBlock = (given, after) => {
                    given(_).then((incoming) => {
                        expect(incoming).to.equal(message);
                        return ok;
                    });
                    after(2000).then(() => {
                        throw OTPError(otp.Symbols.timeout);
                    });
                };

                const message = Math.floor(
                    Math.random() * Number.MAX_SAFE_INTEGER
                );

                clientCtx.send(t(serverName, serverNode.name), message);
                await expect(serverCtx.receiveBlock(buildBlock)).to.eventually.equal(
                    ok
                );

                serverCtx.send(t(clientName, clientNode.name), message);
                await expect(clientCtx.receiveBlock(buildBlock)).to.eventually.equal(
                    ok
                );
            });
            describe('with buffer types', function() {
                let buffA, buffB;
                beforeEach(function() {
                    buffA = Buffer.from(
                        'buffer A is a Buffer instance, which is a view of an ArrayBuffer',
                        'utf8'
                    );
                    buffB = Buffer.from(
                        'buffer B is a small ArrayBuffer',
                        'utf8'
                    );
                });
                it('sends them seperately', async function() {
                    const name = Symbol.for('receiver');
                    const listener = sinon.spy(function(
                        fromPid,
                        toPid,
                        message,
                        ...buffers
                    ) {
                        log(
                            clientCtx,
                            'transportSocketIO(buffers: %o)',
                            buffers
                        );
                        expect(buffers.length).to.equal(2);
                    });

                    clientSocket.on('otp-message', listener);
                    await wait(100);

                    clientNode.spawn(async (ctx) => {
                        ctx.register(name);
                        await ctx.receive();
                    });
                    serverNode.spawn(async (ctx) => {
                        while (!ctx.nodes().includes(clientNode.name)) {
                            await wait(100);
                        }
                        await ctx.send(
                            t(name, clientNode.name),
                            t(ok, buffA, {
                                make: {
                                    one: {
                                        deeply: { nested: l(t(ok, buffB)) },
                                    },
                                },
                            })
                        );
                    });

                    await wait(100);

                    expect(listener).to.have.been.called;
                });
            });
        });

        describe('given a link signal', function() {
            it('passes the signal to the remote node', async function() {
                serverCtx.send(
                    t(clientName, clientNode.name),
                    serverCtx.self()
                );
                const pid = await clientCtx.receive(Pid.isPid);
                clientCtx.link(pid);

                await wait(100);

                const clientInfo = clientCtx.processInfo(clientCtx.self());
                expect(clientInfo).to.matchPattern({
                    links: [_],
                    [spread]: _,
                });

                const [remotePid] = clientInfo.links;
                expect(remotePid).to.be.an.instanceOf(Pid);
                expect(clientCtx.node(remotePid)).to.equal(serverNode.name);
            });
        });
        describe('given an unlink signal', function() {
            it('passes the signal to the remote node', async function() {
                serverCtx.send(
                    t(clientName, clientNode.name),
                    serverCtx.self()
                );

                const pid = await clientCtx.receive(Pid.isPid);
                log(clientCtx, 'unlink(received_pid: %o)', pid);
                clientCtx.link(pid);

                await wait(100);

                const clientInfoA = clientCtx.processInfo(clientCtx.self());
                expect(clientInfoA).to.matchPattern({
                    links: [_],
                    [spread]: _,
                });

                const serverInfoA = serverCtx.processInfo(serverCtx.self());
                expect(serverInfoA).to.matchPattern({
                    links: [_],
                    [spread]: _,
                });

                log(clientCtx, 'unlink(linked)');

                clientCtx.unlink(pid);
                await wait(100);

                log(clientCtx, 'unlink(unlinked)');

                const clientInfoB = clientCtx.processInfo(clientCtx.self());
                expect(clientInfoB).to.matchPattern({
                    links: [],
                    [spread]: _,
                });
                const serverInfoB = serverCtx.processInfo(serverCtx.self());
                expect(serverInfoB).to.matchPattern({
                    links: [],
                    [spread]: _,
                });
            });
        });
        describe('given an exit signal', function() {
            it('passes the signal to the remote node', async function() {
                serverCtx.send(
                    t(clientName, clientNode.name),
                    serverCtx.self()
                );

                const pid = await clientCtx.receive(Pid.isPid);
                clientCtx.exit(pid, kill);

                await wait(100);

                expect(serverCtx.processInfo(serverCtx.self())).to.be.undefined;
                await expect(serverCtx.death).to.eventually.equal(killed);
            });
        });
    });
    describe('when destroyed', function() {
        const serverName = Symbol.for('server');
        const clientName = Symbol.for('client');
        let clientCtx;
        let serverCtx;
        let destroyClient;
        let destroyServer;

        beforeEach(async function() {
            clientCtx = clientNode.makeContext();
            clientCtx.register(clientName);

            serverCtx = serverNode.makeContext();
            serverCtx.register(serverName);

            destroyClient = useSocketIO(clientNode, clientSocket);
            destroyServer = useSocketIO(serverNode, serverSocket);

            await wait(100);
        });

        afterEach(function() {
            try {
                destroyClient();
                /* eslint-disable-next-line no-empty */
            } finally {
            }

            try {
                destroyServer();
                /* eslint-disable-next-line no-empty */
            } finally {
            }
        });

        it('stops federating signals', async function() {
            serverCtx.send(t(clientName, clientNode.name), serverCtx.self());
            const pid = await clientCtx.receive(Pid.isPid);

            expect(destroyClient).not.to.throw();

            await wait(100);

            expect(clientSocket.connected).to.equal(false);
            expect(serverSocket.connected).to.equal(false);
            expect(clientCtx.send(pid, 'message')).to.equal(ok);
            expect(serverCtx.receive(_, 500)).to.be.rejectedWithTerm(timeout);
        });
    });
});
