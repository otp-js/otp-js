import '@otpjs/test_utils';
import { createServer } from 'http';
import io from 'socket.io';
import clientIO from 'socket.io-client';

import { register as useSocketIO } from '../src';
import * as otp from '@otpjs/core';

const { DOWN, normal } = otp.Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io:__tests__')(...args);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let serverNode = null;
let clientNode = null;
let server = null;
let serverManager = null;
let serverSocket = null;
let clientSocket = null;

beforeEach(async function() {
    serverNode = new otp.Node();
    clientNode = new otp.Node();

    server = createServer();
    server.listen(0);
    serverManager = io(server);

    const loadServerSocket = new Promise((resolve, reject) => {
        serverManager.once(
            'connection',
            resolve
        );
    });

    const port = server.address().port;
    clientSocket = clientIO(`http://localhost:${port}`)

    serverSocket = await loadServerSocket;
});

afterEach(function() {
    serverSocket.disconnect();
    serverSocket = null;

    clientSocket.disconnect();
    clientSocket = null;

    server.close();
    server = null;
    serverManager = null;

    serverNode = null;
    clientNode = null;
})

describe('@otpjs/transports-socket.io', function() {
    it('can register from the both sides', async function() {
        useSocketIO(clientNode, clientSocket, 'server');
        useSocketIO(serverNode, serverSocket, 'client');

        await wait(10);

        expect(serverNode.nodes()).toContain('client');
        expect(clientNode.nodes()).toContain('server');
    });
    it('can route to named remote processes', async function() {
        useSocketIO(clientNode, clientSocket, 'server');
        useSocketIO(serverNode, serverSocket, 'client');

        await wait(100);

        let pid;
        await new Promise(async (resolve, reject) => {
            serverNode.spawn(async (ctx) => {
                try {
                    log(ctx, 'spawned');
                    ctx.register('test');
                    const message = await ctx.receive(500);
                    expect(message).toBe('test');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            })

            await wait(100);

            pid = clientNode.spawn(async (ctx) => {
                const target = ['test', 'server'];
                log(ctx, 'send(%o, test)', target);
                ctx.send(target, 'test');
                await wait(100);
            })
        });

        clientNode.deliver(pid, 'die');
    });
    it('supports monitoring over the transport', async function() {
        useSocketIO(clientNode, clientSocket, 'server');
        useSocketIO(serverNode, serverSocket, 'client');

        await wait(100);

        let pidA = serverNode.spawn(async (ctx) => {
            ctx.register('test');
            await ctx.receive();
        });

        await wait(100);

        let mref, pidB;
        await expect(new Promise((resolve, reject) => {
            pidB = clientNode.spawn(async (ctx) => {
                mref = ctx.monitor(['test', 'server']);
                ctx.send(['test', 'server'], 'stop');
                resolve(await ctx.receive());
            });
        })).resolves.toMatchPattern([
            DOWN,
            mref,
            'process',
            otp.Pid.isPid,
            normal
        ])
    })

    it('can be unregistered', async function() {
        const destroyClient = useSocketIO(clientNode, clientSocket, 'server');
        const destroyServer = useSocketIO(serverNode, serverSocket, 'client');

        await wait(10);

        expect(serverNode.nodes()).toContain('client');
        expect(clientNode.nodes()).toContain('server');

        destroyClient();
        destroyServer();

        await wait(10);

        expect(serverNode.nodes()).not.toContain('client');
        expect(clientNode.nodes()).not.toContain('server');
    })

    it('can be bridged over another node', async function() {
        const loadServerSocket = new Promise((resolve, reject) => {
            serverManager.once(
                'connection',
                resolve
            );
        });

        const clientNodeB = new otp.Node();
        const port = server.address().port;
        const clientSocketB = clientIO(`http://localhost:${port}`)
        const serverSocketB = await loadServerSocket;

        const destroyClientA = useSocketIO(clientNode, clientSocket, 'serverA', { bridge: true });
        const destroyServerA = useSocketIO(serverNode, serverSocket, 'clientA', { bridge: true })

        const destroyClientB = useSocketIO(clientNodeB, clientSocketB, 'serverA', { bridge: true });
        const destroyServerB = useSocketIO(serverNode, serverSocketB, 'clientB', { bridge: true })

        await wait(100);

        let result = new Promise((resolve, reject) => {
            const pidA = clientNode.spawn(async (ctx) => {
                ctx.register('test');
                resolve(await ctx.receive());
            })
        });

        await wait(100);

        const pidB = clientNodeB.spawn((ctx) => {
            ctx.send(['test', 'clientA'], 'test');
        });

        await expect(result).resolves.toBe('test');

        clientSocketB.disconnect();

        destroyClientA();
        destroyServerA();
        destroyClientB();
        destroyServerB();
    })
})
