import { Pid, Ref, serialize, deserialize } from '@otpjs/core';

export function register(node, socket, name = Symbol.for('socket.io')) {
    const ctx = node.makeContext();
    const routerId = node.registerRouter(name, ctx.self());

    socket.on('otp-message', (to, message) => {
        to = JSON.parse(to, revive);
        message = deserialize(message, revive);

        node.deliver(to, message);
    });

    recycle();

    function recycle() {
        ctx.receive().then(forward).then(recycle);
    }

    function forward({ to, message }) {
        to = serialize(to, replace);
        message = serialize(message, replace);
        socket.emit(
            'otp-message',
            to,
            message
        );
    }

    function revive(key, value) {
        if (value instanceof Pid) {
            if (value.node === Pid.REMOTE) {
                return Pid.of(routerId, value.process);
            } else if (value.node === Pid.LOCAL) {
                return value;
            } else {
                const id = node.getRouterId(value.node);
                return Pid.of(id, value.process);
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
                return Pid.of(Pid.REMOTE, value.process);
            } else if (value.node === routerId) {
                return Pid.of(Pid.LOCAL, value.process);
            } else {
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
