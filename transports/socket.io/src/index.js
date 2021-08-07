import { Pid, Ref, serialize, deserialize, Symbols } from '@otpjs/core';

const { relay, _ } = Symbols;

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io')(...args);
}

export function register(node, socket, name = Symbol.for('socket.io')) {
    const ctx = node.makeContext();
    const routerId = node.registerRouter(name, ctx.self());

    log(ctx, 'register(%o)', routerId);

    socket.on('otp-message', (to, message) => {
        log(ctx, 'otp-message(%o)', to);
        to = deserialize(to, revive);
        message = deserialize(message, revive);
        node.deliver(to, message);
    });

    recycle();

    function recycle() {
        ctx.receive([relay, _, _]).then(forward).then(recycle);
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
