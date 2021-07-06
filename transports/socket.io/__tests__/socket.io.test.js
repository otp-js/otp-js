import { createServer } from 'http';
import io from 'socket.io';
import clientIO from 'socket.io-client';

import * as transport from '../src';
import * as otp from '@otpjs/core';

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
    it('can register from the client side', function() {
        transport.register(clientNode, clientSocket);
        transport.register(serverNode, serverSocket);

        return new Promise((resolve, reject) => {
            const pidA = serverNode.spawn(async (ctx) => {
                const message = await ctx.receive();
                expect(message).toBe('test');
                resolve();
            })
            const pidB = clientNode.spawn((ctx) => {
                ctx.send(otp.Pid.of(1, pidA.process), 'test');
            })
        })
    });
})
