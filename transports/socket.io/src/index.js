import { Pid, Ref, serialize, compile, caseOf, deserialize, Symbols } from '@otpjs/core';

const { relay, monitor, shutdown, DOWN, _, trap_exit, discover } = Symbols;

const disconnect = Symbol.for('disconnect');

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io')(...args);
}

const receivers = {
    relay: compile([relay, _, _]),
    monitor: compile([monitor, _, _, _]),
    discover: compile([discover, _, _, _]),
};

function defaultOptions() {
    return {
        bridge: false
    };
}

export function register(node, socket, name = Symbol.for('socket.io'), options = defaultOptions()) {
    let routerId;
    let ctx;
    let running = false;

    const root = node.makeContext();
    log(root, 'options : %o', options);

    const { bridge } = options;

    socket.on('otp-message', handleMessage);
    socket.on('otp-monitor', handleMonitor);
    socket.on('otp-discover', handleDiscover);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);


    if (socket.connected) {
        handleConnect();
    }

    return destroy;

    function recycle() {
        if (running) {
            ctx.receive(...Object.values(receivers))
                .then(forward)
                .then(recycle)
                .catch(
                    err => log(ctx, 'recycle() : error : %o', err)
                );
        }
    }

    function forward(op) {
        log(ctx, 'forward(%o)', op);
        const compare = caseOf(op);

        if (compare(receivers.relay)) {
            let [, to, message] = op;
            log(ctx, 'forward(%o)', to);
            to = serialize(to, replace);
            message = serialize(message, replace);

            log(ctx, 'forward(%o) : socket.emit(otp-message, %o, %o)', to, to, message);
            socket.emit(
                'otp-message',
                to,
                message
            );
        } else if (compare(receivers.monitor)) {
            let [, pid, ref, watcher] = op;
            log(ctx, 'monitor(%o, %o, %o)', pid, ref, watcher);
            pid = serialize(pid, replace);
            ref = serialize(ref, replace);
            watcher = serialize(watcher, replace);

            log(ctx, 'monitor(%o, %o, %o) : socket.emit(otp-monitor)', pid, ref, watcher);
            socket.emit(
                'otp-monitor',
                pid,
                ref,
                watcher
            )
        } else if (compare(receivers.discover)) {
            let [, routerId, name, pid] = op;

            routerId = serialize(routerId, replace);
            name = serialize(name, replace);
            pid = serialize(pid, replace);

            log(ctx, 'socket.emit(otp-discover, %o, %o, %o)', routerId, name, pid);
            socket.emit(
                'otp-discover',
                routerId,
                name,
                pid
            )
        }
    }

    function handleConnect() {
        try {
            ctx = node.makeContext();
            ctx.processFlag(trap_exit, true);

            routerId = node.registerRouter(name, ctx.self(), { bridge });
            log(ctx, 'register(%o) : handleConnect()', routerId);

            running = true;
            recycle();
        } catch (err) {
            log(ctx, 'handleConnect() : error : %o', err);
        }
    }

    function handleDiscover(id, name, pid) {
        log(ctx, 'handleDiscover(%o, %o, %o)', id, name, pid);

        id = deserialize(id, revive);
        name = deserialize(name, revive);
        pid = deserialize(pid, revive);

        log(ctx, 'handleDiscover(%o, %o, %o)', id, name, pid);

        node.registerRouter(name, pid, { bridge });
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

    function handleMonitor(pid, ref, watcher) {
        try {
            log(ctx, 'handleMonitor(%o, %o, %o)', pid, ref, watcher);
            pid = deserialize(pid, revive);
            ref = deserialize(ref, revive);
            watcher = deserialize(watcher, revive);
            node.monitor(watcher, pid, ref);
        } catch (err) {
            log(ctx, 'handleMonitor(%o) : error : %o', to, err);
            node.deliver(watcher, [
                DOWN,
                ref,
                'process',
                pid,
                err.message
            ]);
        }
    }

    function destroy(reason = shutdown) {
        try {
            socket.disconnect();
            socket.off('otp-message', handleMessage);
            socket.off('otp-monitor', handleMonitor);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            node.unregisterRouter(name, ctx.self());
            ctx.die(reason);
        } catch (err) {
            log(ctx, 'destroy(%o) : error : %o', reason, err);
        }
    }

    function revive(key, value) {
        const compare = caseOf(value);
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
                const updated = Ref.for(routerId, value.ref);
                log(ctx, 'restore_remote_ref(%o) : %o', value, updated);
                return updated;
            } else if (value.node === Ref.LOCAL) {
                log(ctx, 'restore_local_ref(%o)', value);
                return value;
            } else {
                const id = node.getRouterId(value.node);
                value = Ref.for(id, value.process);
                log(ctx, 'restore_unknown_ref(%o)', value);
                return value;
            }
        } else if (compare(['$ref', _, _])) {
            const [, remote, ref] = value;
            const routerId = node.getRouterId(remote);
            return Ref.for(routerId, ref)
        } else if (compare(['$pid', _, _])) {
            const [, remote, process] = value;
            const routerId = node.getRouterId(remote);
            return Pid.of(routerId, process);
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
                const name = node.getRouterName(value.node);
                return ['$ref', name, value.process];
            }
        } else if (value instanceof Ref) {
            if (value.node === Ref.LOCAL) {
                log(ctx, 'replace_local_ref_with_remote(%o)', value);
                return Ref.for(Ref.REMOTE, value.ref);
            } else if (value.node === routerId) {
                log(ctx, 'replace_remote_ref_with_local(%o)', value);
                return Ref.for(Ref.LOCAL, value.ref);
            } else {
                log(ctx, 'replace_unknown_ref_with_name(%o)', value);
                const name = node.getRouterName(value.node);
                return ['$ref', name, value.ref];
            }
        } else {
            return value;
        }
    }
}
