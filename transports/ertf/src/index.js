import { Symbols } from '@otpjs/core';
import { Pid, Ref } from '@otpjs/types';
import { compile, caseOf } from '@otpjs/matching';
import makeParser from './parser';
import * as net from 'net';
import * as handshake from './handshake';
import { makeLengthScanner } from './handshake/common';

function log(ctx, ...formatters) {
    return ctx.log.extend('transports:ertf')(...formatters);
}

export async function register(node, socket, options) {
    const ctx = node.makeContext();
    const lengthScanner = makeLengthScanner(ctx);
    const nodeInformation = await handshake.receive(
        node,
        ctx,
        socket,
        lengthScanner,
        options
    );
    return _handleSocket(node, ctx, socket, lengthScanner, {
        ...options,
        nodeInformation,
    });
}

export async function connect(node, { host, port }, options) {
    const ctx = node.makeContext();
    const socket = net.connect(port);
    const lengthScanner = makeLengthScanner(ctx);
    const nodeInformation = await handshake.initiate(
        node,
        ctx,
        socket,
        lengthScanner,
        options
    );
    return _handleSocket(node, ctx, socket, lengthScanner, {
        ...options,
        nodeInformation,
    });
}

function _handleSocket(node, ctx, socket, lengthScanner, options) {
    const { type } = options;

    log(ctx, '_handleSocket(%o)', ctx.self());

    if (socket.connected) {
        handleConnect();
    }

    const parser = makeParser(ctx);
    log(ctx, '_handleSocket(%o) : lengthScanner.on(data)', ctx.self());
    lengthScanner.pipe(parser);
    parser.on('data', (data) => {
        log(ctx, '_handleSocket(%o) : parser.on(data, %o)', ctx.self(), data);
        if (data.type === 'heartbeat') {
            const message = Buffer.alloc(2, 0);
            log(
                ctx,
                '_handleSocket(%o) : parser.on(data, %o) : socket.write(%o)',
                ctx.self(),
                data,
                message
            );
            socket.write(message);
        }
    });

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

        node.registerRouter(source, score, name, pid, { bridge: false, type });
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
            node.deliver(watcher, [DOWN, ref, 'process', pid, err.message]);
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
}
