import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { make as makeSerializer } from '@otpjs/serializer-json';
import { Pid, t } from '@otpjs/types';

const {
    DOWN,
    EXIT,
    demonitor,
    discover,
    link,
    lost,
    monitor,
    relay,
    shutdown,
    temporary,
    trap_exit,
    unlink,
} = otp.Symbols;
const { _ } = matching.Symbols;

const disconnect = Symbol.for('disconnect');
const TRANSPORT_COST = 1;

function log(ctx, ...args) {
    return ctx.log.extend('transports:socket.io')(...args);
}

function defaultOptions() {
    return {
        bridge: false,
        type: temporary,
    };
}

export function register(node, socket, options = defaultOptions()) {
    const { serialize, deserialize } = makeSerializer(node, {
        stringify: false,
    });
    let ctx;
    let running = false;

    const process = matching.clauses(function routeProcess(route) {
        route(t(relay, _, _, _)).to(relayMessage);
        route(t(link, _, _)).to(relayLink);
        route(t(unlink, _, _)).to(relayUnlink);
        route(t(monitor, _, _, _)).to(relayMonitor);
        route(t(demonitor, _, _, _)).to(relayDemonitor);
        route(t(EXIT, _, _, _)).to(relayEXIT);
        route(t(DOWN, _, _, _, _)).to(relayDOWN);
    });
    const forward = matching.clauses(function routeForward(route) {
        route(t(relay, _)).to(([, op]) => process(op));
        route(t(lost, _)).to(relayLost);
        route(t(discover, _, _, _, _, _)).to(relayDiscovery);
        return 'socket-io.process';
    });

    const { bridge, type } = options;

    socket.on('otp-message', handleMessage);
    socket.on('otp-link', handleLink);
    socket.on('otp-unlink', handleUnlink);
    socket.on('otp-monitor', handleMonitor);
    socket.on('otp-demonitor', handleDemonitor);
    socket.on('otp-discover', handleDiscover);
    socket.on('otp-lost', handleLost);
    socket.on('otp-EXIT', handleEXIT);
    socket.on('otp-DOWN', handleDOWN);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
        handleConnect();
    }

    return destroy;

    function recycle() {
        if (running) {
            ctx.receive()
                .then(forward)
                .then(recycle)
                .catch((err) => log(ctx, 'recycle() : error : %o', err));
        }
    }
    function destroy(reason = shutdown) {
        try {
            socket.disconnect();
            handleDisconnect();
        } catch (err) {
            log(ctx, 'destroy(reason: %o, error: %o)', reason, err);
        } finally {
            ctx.die(reason);
            socket.off('otp-message', handleMessage);
            socket.off('otp-monitor', handleMonitor);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        }
    }

    function relayMessage([, fromPid, toPid, message]) {
        log(
            ctx,
            'relayMessage(fromPid: %o, toPid: %o, message: %o)',
            fromPid,
            toPid,
            message
        );
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        message = serialize(message);
        socket.emit('otp-message', fromPid, toPid, message, ...buffers);
    }
    function relayLink([, fromPid, toPid]) {
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        socket.emit('otp-link', fromPid, toPid, ...buffers);
    }
    function relayUnlink([, fromPid, toPid]) {
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        socket.emit('otp-unlink', fromPid, toPid, ...buffers);
    }
    function relayMonitor([, fromPid, toPid, ref]) {
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        socket.emit('otp-monitor', fromPid, toPid, ref, ...buffers);
    }
    function relayDemonitor([, fromPid, toPid, ref]) {
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        socket.emit('otp-demonitor', toPid, ref, fromPid, ...buffers);
    }
    function relayEXIT([, fromPid, toPid, reason]) {
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        reason = serialize(reason);
        socket.emit('otp-EXIT', fromPid, toPid, reason, ...buffers);
    }
    function relayDOWN([, fromPid, toPid, ref, reason]) {
        log(
            ctx,
            'relayDOWN(fromPid: %o, toPid: %o, ref: %o, reason: %o)',
            fromPid,
            toPid,
            ref,
            reason
        );
        const { replace: serialize, buffers } = replacer();
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        reason = serialize(reason);
        socket.emit('otp-DOWN', fromPid, toPid, ref, reason, ...buffers);
    }
    function relayDiscovery([, source, score, name, type, pid]) {
        const { replace: serialize, buffers } = replacer();
        log(
            ctx,
            'relayDiscover(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            type,
            pid
        );
        source = serialize(source ?? node.name);
        score = serialize(score);
        name = serialize(name);
        type = serialize(type);
        pid = serialize(pid);
        log(
            ctx,
            'relayDiscover(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            type,
            pid
        );
        socket.emit('otp-discover', source, score, name, type, pid, ...buffers);
    }

    function relayLost([, pid]) {
        const { replace: serialize, buffers } = replacer();
        pid = serialize(pid);
        socket.emit('otp-lost', pid, ...buffers);
    }
    function relayDiscovery([, source, score, name, type, pid]) {
        source = serialize(source ?? node.name);
        score = serialize(score);
        name = serialize(name);
        type = serialize(type);
        pid = serialize(pid);
        socket.emit('otp-discover', source, score, name, type, pid);
    }

    function relayLost([, pid]) {
        pid = serialize(pid);
        socket.emit('otp-lost', pid);
    }

    function handleConnect() {
        ctx = node.makeContext();
        ctx.log = ctx.logger('transports:socket.io');
        ctx.processFlag(trap_exit, true);

        let name = node.name;
        let score = 0;
        let source = null;
        let ourType = type;
        let pid = null;

        const { replace: serialize, buffers } = replacer();
        log(
            ctx,
            'handleConnect(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            ourType,
            pid
        );
        name = serialize(name);
        score = serialize(score);
        source = serialize(source);
        ourType = serialize(ourType);
        pid = serialize(pid);
        log(
            ctx,
            'handleConnect(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            ourType,
            pid
        );

        socket.emit(
            'otp-discover',
            source,
            score,
            name,
            ourType,
            pid,
            ...buffers
        );

        running = true;
        recycle();
    }
    function handleLost(pid, ...buffers) {
        const deserialize = reviver(buffers);
        pid = deserialize(pid);
        node.unregisterRouter(pid);
    }
    function handleDiscover(source, score, name, theirType, pid, ...buffers) {
        const deserialize = reviver(buffers);
        log(
            ctx,
            'handleDiscover(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            theirType,
            pid
        );
        source = deserialize(source) ?? node.name;
        name = deserialize(name);
        score = deserialize(score);
        theirType = deserialize(theirType);
        pid = deserialize(pid) ?? ctx.self();
        log(
            ctx,
            'handleDiscover(source: %o, score: %o, name: %o, type: %o, pid: %o)',
            source,
            score,
            name,
            theirType,
            pid
        );

        // Apply "transportation cost" to score to account for indirect connections
        score += TRANSPORT_COST;

        node.registerRouter(source, score, name, pid, {
            bridge,
            type: theirType,
        });
    }
    function handleDisconnect() {
        running = false;
        node.unregisterRouter(ctx.self());

        // drain the messagebox
        try {
            ctx.drain(disconnect);
            ctx.exit(disconnect);
        } catch (err) {
            log(ctx, 'drain() : error : %o', err);
        }
    }
    function handleLink(fromPid, toPid, ...buffers) {
        const deserialize = reviver(buffers);
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        node.signal(fromPid, link, toPid);
    }
    function handleUnlink(fromPid, toPid, ...buffers) {
        const deserialize = reviver(buffers);
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        node.signal(fromPid, unlink, toPid);
    }
    function handleMessage(fromPid, toPid, message, ...buffers) {
        const deserialize = reviver(buffers);
        log(
            ctx,
            'handleMessage(fromPid: %o, toPid: %o, message: %o)',
            fromPid,
            toPid,
            message
        );
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        message = deserialize(message);
        log(
            ctx,
            'handleMessage(fromPid: %o, toPid: %o, message: %o)',
            fromPid,
            toPid,
            message
        );
        node.deliver(fromPid, toPid, message);
    }
    function handleMonitor(fromPid, toPid, ref, ...buffers) {
        const deserialize = reviver(buffers);
        try {
            fromPid = deserialize(fromPid);
            toPid = deserialize(toPid);
            ref = deserialize(ref);
            node.signal(fromPid, monitor, toPid, ref);
        } catch (err) {
            node.signal(fromPid, DOWN, toPid, ref, err.term ?? err.message);
        }
    }
    function handleDemonitor(toPid, ref, fromPid, ...buffers) {
        const deserialize = reviver(buffers);
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        ref = deserialize(ref);
        node.signal(fromPid, demonitor, toPid, ref);
    }
    function handleEXIT(fromPid, toPid, reason, ...buffers) {
        const deserialize = reviver(buffers);
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        reason = deserialize(reason);

        node.signal(fromPid, EXIT, toPid, reason);
    }
    function handleDOWN(fromPid, toPid, ref, reason, ...buffers) {
        const deserialize = reviver(buffers);
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        ref = deserialize(ref);
        reason = deserialize(reason);

        log(
            ctx,
            'handleDOWN(fromPid: %o, toPid: %o, ref: %o, reason: %o)',
            fromPid,
            toPid,
            ref,
            reason
        );

        node.signal(fromPid, DOWN, toPid, ref, reason);
    }

    function reviver(buffers) {
        return function revive(value) {
            return deserialize(value, (key, value) => {
                if (
                    typeof value === 'object' &&
                    value !== null &&
                    matching.compare(
                        {
                            type: '$otp.buffer',
                            index: Number.isInteger,
                        },
                        value
                    )
                ) {
                    return buffers[value.index];
                }
            });
        };
    }

    function replacer() {
        const buffers = [];
        return { replace, buffers };
        function replace(value) {
            return serialize(value, (key, value) => {
                if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
                    const index = buffers.indexOf(value);
                    if (index >= 0) {
                        return { type: '$otp.buffer', index };
                    } else {
                        const index = buffers.length;
                        buffers.push(value);
                        return { type: '$otp.buffer', index };
                    }
                }
            });
        }
    }
}
