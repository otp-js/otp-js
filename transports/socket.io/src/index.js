import { Pid, Ref, serialize, deserialize, Symbols } from '@otpjs/core';

const { relay, shutdown, _, trap_exit } = Symbols;

const disconnect = Symbol.for('disconnect');

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io')(...args);
}

export function register(node, socket, name = Symbol.for('socket.io')) {
    let routerId;
    let ctx;
    let running = false;

    socket.on('otp-message', handleMessage);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
        handleConnect();
    }

    return destroy;

    function recycle() {
        if (running) {
            ctx.receive([relay, _, _])
                .then(forward)
                .then(recycle)
                .catch(
                    err => log(ctx, 'recycle() : error : %o', err)
                );
        }
    }

    function forward([, to, message]) {
        log(ctx, 'forward(%o)', to);
        to = serialize(to, replace);
        message = serialize(message, replace);

        log(ctx, 'forward(%o) : socket.emit(otp-message, %o, %o)', to, to, message);
        socket.emit(
            'otp-message',
            to,
            message
        );
    }

    function handleConnect() {
        try {
            ctx = node.makeContext();
            ctx.processFlag(trap_exit, true);

            routerId = node.registerRouter(name, ctx.self());
            log(ctx, 'register(%o) : handleConnect()', routerId);

            running = true;
            recycle();
        } catch (err) {
            log(ctx, 'handleConnect() : error : %o', err);
        }
    }

    async function handleDisconnect() {
        try {
            running = false;
            routerId = null;
            node.unregisterRouter(name, ctx.self());

            // drain the messagebox
            try {
                ctx.__drain(disconnect);
            } catch (err) {
                log(ctx, 'drain() : error : %o', err);
            }
        } catch (err) {
            log(ctx, 'handleDisconnect() : error : %o', err);
        }
    }

    function handleMessage(to, message) {
        try {
            log(ctx, 'handleMessage(%o)', to);
            to = deserialize(to, revive);
            message = deserialize(message, revive);
            node.deliver(to, message);
        } catch (err) {
            log(ctx, 'handleMessage(%o) : error : %o', to, err);
        }
    }

    function destroy(reason = shutdown) {
        try {
            socket.off('otp-message', handleMessage);
            node.unregisterRouter(name, ctx.self());
            ctx.die(reason);
        } catch (err) {
            log(ctx, 'destroy(%o) : error : %o', reason, err);
        }
    }

    function revive(key, value) {
        if (value instanceof Pid) {
            if (value.node === Pid.REMOTE) {
                log(ctx, 'restore_remote_pid(%o)', value);
                return Pid.of(routerId, value.process);
            } else if (value.node === Pid.LOCAL) {
                log(ctx, 'restore_local_pid(%o)', value);
                return value;
            } else {
                const id = node.getRouterId(value.node);
                value = Pid.of(id, value.process);
                log(ctx, 'restore_unknown_pid(%o)', value);
                return value;
            }
        } else if (value instanceof Ref) {
            if (value.node === Ref.REMOTE) {
                return Ref.for(routerId, value.ref);
            } else if (value.node === Ref.LOCAL) {
                return value;
            } else {
                const id = node.getRouterId(value.node);
                return Ref.for(id, value.ref);
            }
        } else {
            return value;
        }
    }

    function replace(key, value) {
        if (value instanceof Pid) {
            if (value.node === Pid.LOCAL) {
                log(ctx, 'replace_local_pid_with_remote(%o)', value);
                return Pid.of(Pid.REMOTE, value.process);
            } else if (value.node === routerId) {
                log(ctx, 'replace_remote_pid_with_local(%o)', value);
                return Pid.of(Pid.LOCAL, value.process);
            } else {
                log(ctx, 'replace_unknown_pid_with_name(%o)', value);
                const name = node.getRouterName();
                return Pid.of(name, value.process);
            }
        } else if (value instanceof Ref) {
            if (value.node === Ref.LOCAL) {
                return Ref.for(Ref.REMOTE, value.ref);
            } else if (value.node === routerId) {
                return Ref.for(Ref.LOCAL, value.ref);
            } else {
                const name = node.getRouterName();
                return Ref.for(name, value.process);
            }
        } else {
            return value;
        }
    }
}
