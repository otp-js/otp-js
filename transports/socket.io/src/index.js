import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { make as makeSerializer } from '@otpjs/serializer-json';
import { caseOf, compile } from '@otpjs/matching';
import { Pid, Ref, t, l } from '@otpjs/types';

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
    const { serialize, deserialize } = makeSerializer(node);
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
        route(t(discover, _, _, _, _)).to(relayDiscovery);
        return 'socket-io.process';
    });

    const { bridge, type } = options;

    socket.on('otp-message', handleMessage);
    socket.on('otp-link', handleLink);
    socket.on('otp-unlink', handleUnlink);
    socket.on('otp-monitor', handleMonitor);
    socket.on('otp-demonitor', handleDemonitor);
    socket.on('otp-discover', handleDiscover);
    socket.on('otp-EXIT', handleEXIT);
    socket.on('otp-DOWN', handleDOWN);
    //socket.on('otp-lost', handleLost);
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
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        message = serialize(message);
        socket.emit('otp-message', fromPid, toPid, message);
    }
    function relayLink([, fromPid, toPid]) {
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        socket.emit('otp-link', fromPid, toPid);
    }
    function relayUnlink([, fromPid, toPid]) {
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        socket.emit('otp-unlink', fromPid, toPid);
    }
    function relayMonitor([, fromPid, toPid, ref]) {
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        socket.emit('otp-monitor', fromPid, toPid, ref);
    }
    function relayDemonitor([, fromPid, toPid, ref]) {
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        socket.emit('otp-demonitor', toPid, ref, fromPid);
    }
    function relayEXIT([, fromPid, toPid, reason]) {
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        reason = serialize(reason);
        socket.emit('otp-EXIT', fromPid, toPid, reason);
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
        fromPid = serialize(fromPid);
        toPid = serialize(toPid);
        ref = serialize(ref);
        reason = serialize(reason);
        socket.emit('otp-DOWN', fromPid, toPid, ref, reason);
    }
    function relayDiscovery([, source, score, name, pid]) {
        source = serialize(source ?? node.name);
        score = serialize(score);
        name = serialize(name);
        pid = serialize(pid);
        socket.emit('otp-discover', source, score, name, pid);
    }

    function handleConnect() {
        ctx = node.makeContext();
        ctx.processFlag(trap_exit, true);

        socket.emit(
            'otp-discover',
            serialize(null),
            serialize(0),
            serialize(node.name),
            serialize(null)
        );

        running = true;
        recycle();
    }
    function handleDiscover(source, score, name, pid = undefined) {
        source = deserialize(source) ?? node.name;
        name = deserialize(name);
        pid = deserialize(pid) ?? ctx.self();
        score = deserialize(score);

        // Apply "transportation cost" to score to account for indirect connections
        score += TRANSPORT_COST;

        node.registerRouter(source, score, name, pid, { bridge, type });
    }
    function handleDisconnect() {
        running = false;
        node.unregisterRouter(ctx.self());

        // drain the messagebox
        try {
            ctx.drain(disconnect);
        } catch (err) {
            log(ctx, 'drain() : error : %o', err);
        }
    }
    function handleLink(fromPid, toPid) {
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        node.signal(fromPid, link, toPid);
    }
    function handleUnlink(fromPid, toPid) {
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        node.signal(fromPid, unlink, toPid);
    }
    function handleMessage(fromPid, toPid, message) {
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
    function handleMonitor(fromPid, toPid, ref) {
        try {
            fromPid = deserialize(fromPid);
            toPid = deserialize(toPid);
            ref = deserialize(ref);
            node.signal(fromPid, monitor, toPid, ref);
        } catch (err) {
            node.signal(fromPid, DOWN, toPid, ref, err.term ?? err.message);
        }
    }
    function handleDemonitor(toPid, ref, fromPid) {
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        ref = deserialize(ref);
        node.signal(fromPid, demonitor, toPid, ref);
    }
    function handleEXIT(fromPid, toPid, reason) {
        fromPid = deserialize(fromPid);
        toPid = deserialize(toPid);
        reason = deserialize(reason);

        node.signal(fromPid, EXIT, toPid, reason);
    }
    function handleDOWN(fromPid, toPid, ref, reason) {
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
}
