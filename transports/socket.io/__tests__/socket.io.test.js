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
        serverManager.on(
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
    it('can register from the client side', async function() {
        useSocketIO(clientNode, clientSocket);
        useSocketIO(serverNode, serverSocket);

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

            pid = clientNode.spawn((ctx) => {
                const targetPid = otp.Pid.of(1, target.process);
                log(ctx, 'send(%o, test)', targetPid);
                ctx.send(targetPid, 'test');
                return ctx.receive();
            })
        });

        clientNode.deliver(pid, 'die');
    });
})
