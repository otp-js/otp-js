import { Symbols } from '@otpjs/core';
import { Pid, Ref } from '@otpjs/types';
import { compile, caseOf } from '@otpjs/matching';
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

const disconnect = Symbol.for('disconnect');
const TRANSPORT_COST = 1;

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
    let running = false;

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

        const dump = await epmd.dumpEpmd(host, port);
        console.log('dump : %o', dump);
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

    function revive(key, value) {
        log(ctx, 'revive(%o)', value);
        const compare = caseOf(value);
        if (compare(['$ref', _, _])) {
            const [, remote, ref] = value;
            const routerId = node.getRouterId(remote);
            const updated = Ref.for(routerId, ref);
            log(ctx, 'restore_remote_ref_with_name(%o) : %o', value, updated);
            return updated;
        } else if (compare(['$pid', _, _])) {
            const [, remote, process] = value;
            const routerId = node.getRouterId(remote);
            const updated = Pid.of(routerId, process);
            log(ctx, 'restore_remote_pid_with_name(%o) : %o', value, updated);
            return updated;
        } else {
            return value;
        }
    }

    function replace(key, value) {
        if (value instanceof Pid) {
            log(ctx, 'replace_unknown_pid_with_name(%o)', value);
            const name = node.getRouterName(value.node);
            return ['$pid', name, value.process];
        } else if (value instanceof Ref) {
            log(ctx, 'replace_unknown_ref_with_name(%o)', value);
            const name = node.getRouterName(value.node);
            return ['$ref', name, value.ref];
        } else {
            return value;
        }
    }
}
