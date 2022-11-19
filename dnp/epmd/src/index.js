import { Symbols } from '@otpjs/core';
import * as net from 'net';
import * as ertf from '@otpjs/transports-ertf';
import epmd from '@otpjs/epmd-client';

const {
    relay,
    monitor,
    shutdown,
    DOWN,
    _,
    trap_exit,
    discover,
    temporary,
    lost,
} = Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('transports:epmd')(...args);
}

function defaultOptions() {
    return {
        bridge: false,
        type: temporary,
        epmd: {
            host: 'localhost',
            port: 4369,
        },
    };
}

export function register(node, options = defaultOptions()) {
    let ctx = node.makeContext();

    log(ctx, 'register(%o) : net.createServer()', node.name);
    const server = net.createServer((socket) =>
        ertf.register(node, socket, options)
    );
    log(ctx, 'register(%o) : server.listen()', node.name);
    server.listen(async () => {
        const host = options.epmd?.host ?? 'localhost';
        const port = options.epmd?.port ?? 4369;
        log(
            ctx,
            'register(%o) : new epmd.Client(%o, %o)',
            node.name,
            host,
            port
        );
        const client = new epmd.Client(host, port);

        log(ctx, 'register(%o) : client.connect()', node.name);
        await new Promise((resolve, reject) => {
            client.connect();
            client.on('connect', (socket) => {
                log(ctx, 'register(%o) : client.register()', node.name);
                client.register(
                    server.address().port,
                    Symbol.keyFor(node.name).split(/@/)[0]
                );
                resolve();
            });
            client.on('error', reject);
        });
    });

    return function destroy(reason = shutdown) {
        try {
            server.close();
        } catch (err) {
            log(ctx, 'destroy(%o) : error : %o', reason, err);
        } finally {
            ctx.die(reason);
        }
    };
}
