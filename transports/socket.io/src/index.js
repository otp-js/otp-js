import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { serialize, deserialize } from '@otpjs/serializer-json';
import { caseOf, compile } from '@otpjs/matching';
import { Pid, Ref, t, l } from '@otpjs/types';

const { relay, monitor, shutdown, DOWN, trap_exit, discover, temporary, lost } =
    otp.Symbols;
const { _ } = matching.Symbols;

const disconnect = Symbol.for('disconnect');
const TRANSPORT_COST = 1;

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io')(...args);
}

const receivers = {
    relay: compile(t(relay, _, _)),
    monitor: compile(t(monitor, _, _, _)),
    discover: compile(t(discover, _, _, _, _)),
    lost: compile(t(lost, _, _, _, _)),
};

function defaultOptions() {
    return {
        bridge: false,
        type: temporary,
    };
}

export function register(node, socket, options = defaultOptions()) {
    let ctx;
    let running = false;

    const root = node.makeContext();
    log(root, 'options : %o', options);

    const { bridge, type } = options;

    socket.on('otp-message', handleMessage);
    socket.on('otp-monitor', handleMonitor);
    socket.on('otp-discover', handleDiscover);
    socket.on('otp-lost', handleLost);
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
                .catch((err) => log(ctx, 'recycle() : error : %o', err));
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

            log(
                ctx,
                'forward(%o) : socket.emit(otp-message, %o, %o)',
                to,
                to,
                message
            );
            socket.emit('otp-message', to, message);
        } else if (compare(receivers.monitor)) {
            let [, pid, ref, watcher] = op;
            log(ctx, 'monitor(%o, %o, %o)', pid, ref, watcher);
            pid = serialize(pid, replace);
            ref = serialize(ref, replace);
            watcher = serialize(watcher, replace);

            log(
                ctx,
                'monitor(%o, %o, %o) : socket.emit(otp-monitor)',
                pid,
                ref,
                watcher
            );
            socket.emit('otp-monitor', pid, ref, watcher);
        } else if (compare(receivers.discover)) {
            let [, source, score, name, pid] = op;

            source = serialize(source ?? node.name, replace);
            score = serialize(score, replace);
            name = serialize(name, replace);
            pid = serialize(pid, replace);

            log(
                ctx,
                'socket.emit(otp-discover, %o, %o)',
                source,
                score,
                name,
                pid
            );
            socket.emit('otp-discover', source, score, name, pid);
        }
    }

    function handleConnect() {
        try {
            ctx = node.makeContext();
            ctx.processFlag(trap_exit, true);

            socket.emit(
                'otp-discover',
                serialize(null, replace),
                serialize(0, replace),
                serialize(node.name, replace),
                serialize(null, replace)
            );

            running = true;
            recycle();
        } catch (err) {
            log(ctx, 'handleConnect() : error : %o', err);
        }
    }

    function handleDiscover(source, score, name, pid = undefined) {
        log(ctx, 'handleDiscover(%o, %o, %o, %o)', source, score, name, pid);

        source = deserialize(source, revive) ?? node.name;
        name = deserialize(name, revive);
        pid = deserialize(pid, revive) ?? ctx.self();
        score = deserialize(score);

        // Apply "transportation cost" to score to account for indirect connections
        score += TRANSPORT_COST;

        log(ctx, 'handleDiscover(%o, %o, %o, %o)', source, score, name, pid);

        node.registerRouter(source, score, name, pid, { bridge, type });
    }

    function handleLost(source, score, name, pid = undefined) {
        log(ctx, 'handleDiscover(%o, %o, %o, %o)', source, score, name, pid);

        source = deserialize(source, revive);
        name = deserialize(name, revive);
        pid = deserialize(pid, revive);
        score = deserialize(score);

        // Apply "transportation cost" to score to account for indirect connections
        score += TRANSPORT_COST;

        log(ctx, 'handleDiscover(%o, %o, %o, %o)', source, score, name, pid);

        node.unregisterRouter(pid, source, score, name);
    }

    async function handleDisconnect() {
        try {
            log(ctx, 'handleDisconnect()');
            running = false;
            node.unregisterRouter(ctx.self());

            // drain the messagebox
            try {
                ctx.drain(disconnect);
            } catch (err) {
                log(ctx, 'drain() : error : %o', err);
            }
        } catch (err) {
            log(ctx, 'handleDisconnect() : error : %o', err);
        }
    }

    function handleMessage(to, message) {
        try {
            log(ctx, 'handleMessage(%o, %o)', to, message);
            to = deserialize(to, revive);
            message = deserialize(message, revive);
            node.deliver(to, message);
        } catch (err) {
            log(ctx, 'handleMessage(%o, %o) : error : %o', to, message, err);
        }
    }

    function handleMonitor(pid, ref, watcher) {
        try {
            log(ctx, 'handleMonitor(%o, %o, %o)', pid, ref, watcher);
            pid = deserialize(pid, revive);
            ref = deserialize(ref, revive);
            watcher = deserialize(watcher, revive);
            log(ctx, 'handleMonitor(%o, %o, %o)', pid, ref, watcher);
            node.monitor(watcher, pid, ref);
        } catch (err) {
            log(ctx, 'handleMonitor(%o, %o) : error : %o', pid, ref, err);
            node.deliver(watcher, t(DOWN, ref, 'process', pid, err.message));
        }
    }

    function destroy(reason = shutdown) {
        try {
            socket.disconnect();
        } catch (err) {
            log(ctx, 'destroy(%o) : error : %o', reason, err);
        } finally {
            ctx.die(reason);
            socket.off('otp-message', handleMessage);
            socket.off('otp-monitor', handleMonitor);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        }
    }

    function revive(key, value) {
        log(ctx, 'revive(%o)', value);
        const compare = caseOf(value);
        if (compare(['$ref', _, _])) {
            const [, remote, ref] = value;
            const routerId = node.getRouterId(remote);
            const updated = Ref.for(routerId, ref);
            log(ctx, 'restore_remote_ref_with_name(%o) : %o', value, updated);
            return updated;
        } else if (compare(['$pid', _, _, _, _])) {
            const [, remote, id, serial, creation] = value;
            const routerId = node.getRouterId(remote);
            const updated = Pid.of(routerId, id, serial, creation);
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
            return ['$pid', name, value.id, value.serial, value.creation];
        } else if (value instanceof Ref) {
            log(ctx, 'replace_unknown_ref_with_name(%o)', value);
            const name = node.getRouterName(Number(value.node));
            return ['$ref', name, value.ref];
        } else {
            return value;
        }
    }
}
