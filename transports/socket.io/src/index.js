import debug from 'debug';
import { Pid, Ref } from '@otpjs/core';

const log = debug('otpjs:transports:socket.io');

export function register(node, socket, name = Symbol.for('socket.io')) {
    const ctx = node.makeContext();
    const routerId = node.registerRouter(name, ctx.self());

    log('register() : routerId : %o', routerId);

    socket.on('otp-message', (to, message) => {
        log('socket.on(otp-message, %o, %o)', to, message)
        to = JSON.parse(to, revive);
        message = JSON.parse(message, revive);

        log('socket.on(otp-message, %o, %o)', to, message);

        node.deliver(to, message);
    });

    recycle();

    function recycle() {
        ctx.receive().then(forward).then(recycle);
    }

    function forward({ to, message }) {
        log('forward(%o, %o)', to, message);
        to = JSON.stringify(to, replace);
        message = JSON.stringify(message, replace);
        log('forward(%o, %o)', to, message);
        socket.emit(
            'otp-message',
            to,
            message
        );
    }

    function revive(key, value) {
        if (typeof value === 'object' && value['$pid']) {
            const pid = new Pid(value['$pid']);
            if (pid.node === 'REMOTE') {
                return Pid.of(routerId, pid.process);
            } else {
                return pid;
            }
        } else if (typeof value === 'object' && value['$ref']) {
            const ref = new Ref(value['$ref']);
            if (ref.node === 'REMOTE') {
                return Ref.for(routerId, ref.process);
            } else {
                return ref;
            }
        } else {
            return value;
        }
    }

    function replace(key, value) {
        if (value instanceof Symbol) {
            return {
                '$sym': Symbol.keyFor(value)
            };
        } else if (value instanceof Pid) {
            log('value.node : %o', value.node);
            log('routerId : %o', routerId);
            if (value.node === Pid.LOCAL) {
                return {
                    '$pid': new String(
                        Pid.of('REMOTE', value.process)
                    )
                };
            } else if (value.node === routerId) {
                return {
                    '$pid': new String(
                        Pid.of(Pid.LOCAL, value.process)
                    )
                };
            } else {
                // TODO: translate remote pids
            }
        } else if (value instanceof Ref) {
            if (value.node === Ref.LOCAL) {
                return {
                    '$ref': new String(Ref.for('REMOTE', value.ref))
                };
            } else if (value.node === routerId) {
                return {
                    '$ref': new String(Ref.for(Ref.LOCAL, value.ref))
                };
            } else {
                // TODO: translate remote refs
            }
        } else {
            log('value : %o', value);
            return value;
        }
    }
}
