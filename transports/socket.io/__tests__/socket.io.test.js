import { createServer } from 'http';
import io from 'socket.io';
import clientIO from 'socket.io-client';

import { register as useSocketIO } from '../src';
import * as otp from '@otpjs/core';

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

        let pid;
        await new Promise(async (resolve, reject) => {
            const target = serverNode.spawn(async (ctx) => {
                try {
                    log(ctx, 'spawned');
                    const message = await ctx.receive(500);
                    expect(message).toBe('test');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            })

            await wait(10);

            pid = clientNode.spawn(async (ctx) => {
                const targetPid = otp.Pid.of(1, target.process);
                log(ctx, 'send(%o, test)', targetPid);
                ctx.send(targetPid, 'test');
                await wait(100);
            })
        });

        clientNode.deliver(pid, 'die');
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
})
