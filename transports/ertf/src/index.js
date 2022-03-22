import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import makeParser from './parser';
import makeEncoder from './encoder';
import * as net from 'net';
import * as handshake from './handshake';
import { makeLengthScanner } from './handshake/common';

function log(ctx, ...formatters) {
    return ctx.log.extend('transports:ertf')(...formatters);
}

const { monitor, demonitor, link, unlink } = otp.Symbols;

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
    const { type, nodeInformation } = options;
    let running = true;

    log(
        ctx,
        '_handleSocket(self: %o, nodeInformation: %o)',
        ctx.self(),
        nodeInformation
    );

    handleConnect();

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

    const encoder = makeEncoder(ctx, node);
    encoder.pipe(socket);

    const forward = matching.clauses((route) => {
        route(t(relay, Pid.isPid, _), _relayToPid);
        route(t(relay, Pid.isPid, _, _), _relayToName);
        route(t(link, _, _), _link);
        route(t(unlink, _, _), _unlink);
        route(t(monitor, _, _, _), _monitor);
        route(t(demonitor, _, _, _), _demonitor);

        function _relayToPid([, to, message]) {
            const control = t(2, 0, to);
            encoder.push({ control, message });
        }

        function _relayToPid([, from, to, message]) {
            const control = t(6, from, 0, to);
            encoder.push({ control, message });
        }

        function _link([, fromPid, toPid]) {
            const control = t(1, fromPid, toPid);
            encoder.push({ control });
        }
    });

    function recycle() {
        if (running) {
            ctx.receive()
                .then(forward)
                .then(recycle)
                .catch((err) => log(ctx, 'recycle() : error : %o', err));
        }
    }

    function handleConnect() {
        try {
            running = true;
            node.registerRouter(
                node.name,
                1,
                nodeInformation.name,
                ctx.self(),
                {
                    bridge: false,
                    type,
                }
            );
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
