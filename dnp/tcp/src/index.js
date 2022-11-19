import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { t, l, Pid, Ref, OTPError } from '@otpjs/types';
import makeParser from './parser';
import makeEncoder from './encoder';
import { make as makeERTF } from '@otpjs/serializer-ertf';
import * as net from 'net';
import * as handshake from './handshake';

const TRANSPORT_COST = 1;

function log(ctx, ...formatters) {
    return ctx.log.extend('transports:ertf')(...formatters);
}

const { monitor, demonitor, link, unlink, EXIT, DOWN, relay } = otp.Symbols;
const { _ } = matching.Symbols;

const isAtom = (value) => typeof value === 'symbol';

export async function register(node, socket, options) {
    socket.setNoDelay(true);
    const ctx = node.makeContext();
    const nodeInformation = await handshake.receive(node, ctx, socket, options);
    await node.registerRouter(
        ctx.node(),
        TRANSPORT_COST,
        nodeInformation.name,
        ctx.self(),
        {
            bridge: false,
        }
    );
    return _handleSocket(node, ctx, socket, Buffer.alloc(0), {
        ...options,
        nodeInformation,
    });
}

export async function connect(node, { host, port }, options) {
    const ctx = node.makeContext();
    const socket = net.connect(port);
    socket.setNoDelay(true);
    const [nodeInformation, chunk] = await handshake.initiate(
        node,
        ctx,
        socket,
        options
    );
    log(ctx, 'connect(nodeInformation: %o)', nodeInformation);
    await node.registerRouter(
        ctx.node(),
        TRANSPORT_COST,
        nodeInformation.name,
        ctx.self(),
        {
            bridge: false,
        }
    );
    return _handleSocket(node, ctx, socket, chunk, {
        ...options,
        nodeInformation,
    });
}

function _handleSocket(node, ctx, socket, leadChunk, options) {
    const { nodeInformation } = options;
    const ERTF = makeERTF(node);
    let unlinks = 0;
    const forward = matching.clauses(function routeForward(route) {
        route(t(relay, _, Pid.isPid, _)).to(_relayToPid);
        route(t(relay, _, isAtom, _)).to(_relayToName);
        route(t(link, _, _)).to(_link);
        route(t(unlink, _, _)).to(_unlink);
        route(t(monitor, _, _)).to(_monitor);
        route(t(demonitor, _, _)).to(_demonitor);
        route(t(EXIT, _, _, _)).to(_EXIT);
        route(t(DOWN, _, _, _, _)).to(_DOWN);

        function _relayToPid([, to, message]) {
            const control = t(2, l.nil, to);
            encoder.write({ control, message });
        }
        function _relayToName([, fromPid, toProc, message]) {
            const control = t(6, fromPid, l.nil, toProc);
            encoder.write({ control, message });
        }
        function _link([, fromPid, toPid]) {
            const control = t(1, fromPid, toPid);
            encoder.write({ control });
        }
        function _unlink([, fromPid, toPid]) {
            const id = unlinks++;
            const control = t(35, id, fromPid, toPid);
            encoder.write({ control });
        }
        function _monitor([, fromPid, toProc, ref]) {
            const control = t(19, fromPid, toProc, ref);
            encoder.write({ control });
        }
        function _demonitor([, fromPid, toProc, ref]) {
            const control = t(20, fromPid, toProc, ref);
            encoder.write({ control });
        }
        function _EXIT([, fromPid, toPid, reason]) {
            const control = t(3, fromPid, toPid, reason);
            encoder.write({ control });
        }
        function _DOWN([, fromProc, toPid, ref, reason]) {
            const control = t(21, fromProc, toPid, ref, reason);
            encoder.write({ control });
        }
    });
    const process = matching.clauses(function routeProcess(route) {
        route(t(relay, _)).to(([, op]) => forward(op));
        return 'tcp.process';
    });
    const receive = matching.clauses((route) => {
        route(t(1, Pid.isPid, Pid.isPid)).to(_link);
        route(t(2, _, Pid.isPid), _).to(_relay);
        route(t(3, Pid.isPid, Pid.isPid, _)).to(_exit);
        route(t(4, Pid.isPid, Pid.isPid)).to(_unlink);
        route(t(5)).to(_linkNode);
        route(t(6, Pid.isPid, _, isAtom), _).to(_relayName);
        route(t(7, Pid.isPid, Pid.isPid)).to(_groupLeader);
        route(t(8, Pid.isPid, Pid.isPid, _)).to(_exit2);
        route(t(19, Pid.isPid, _, Ref.isRef)).to(_monitor);
        route(t(20, Pid.isPid, _, Ref.isRef)).to(_demonitor);
        route(t(21, _, Pid.isPid, Ref.isRef, _)).to(_monitorExit);

        return 'receive';

        function _link([, fromPid, toPid]) {
            node.link(fromPid, toPid);
        }
        function _relay([, cookie, toPid], message) {
            node.deliver(toPid, message);
        }
        function _exit([, fromPid, toPid, reason]) {
            node.deliver(toPid, t(EXIT, fromPid, reason, Error().stack));
        }
        function _unlink([, fromPid, toPid]) {
            node.unlink(fromPid, toPid);
        }
        function _linkNode() {
            // TODO: finalizer? beforeExit?
        }
        function _relayName([, fromPid, _unused, toProc], message) {
            node.deliver(fromPid, toProc, message);
        }
        function _groupLeader([, fromPid, toPid]) {
            // TODO: implement group leaders
        }
        function _exit2([, fromPid, toPid, reason]) {
            node.signalExit(fromPid, toPid, reason);
        }
        function _monitor([, fromPid, toProc, ref]) {
            const toPid = node.whereis(toProc);
            if (toPid) {
                node.monitor(fromPid, toPid, ref);
            } else {
                node.deliver(
                    fromPid,
                    t(DOWN, toProc, 'process', 'noproc', Error().stack)
                );
            }
        }
        function _demonitor([, fromPid, toProc, ref]) {
            node.demonitor(fromPid, toProc, ref);
        }
        function _monitorExit([, fromProc, toPid, reason]) {
            node.deliver(
                toPid,
                t(DOWN, fromProc, 'process', reason, Error().stack)
            );
        }
    });

    let running = true;

    log(
        ctx,
        '_handleSocket(self: %o, nodeInformation: %o)',
        ctx.self(),
        nodeInformation
    );

    const encoder = makeEncoder(node, { ERTF });
    encoder.on('data', (data) => {
        if (data.length > 4) {
            const [control, rest] = ERTF.parse(data.subarray(5));
            const [message] = rest.length > 0 ? ERTF.parse(rest) : [];
            log(ctx, 'encoder.on(control: %o, message: %o)', control, message);
        }
        socket.write(data);
    });
    socket.on('drain', (data) => {
        log(ctx, 'socket.on(drain: %o)', data);
    });
    socket.on('error', (err) => {
        log(ctx, 'socket.on(error: %o)', err);
    });
    socket.on('close', (err) => {
        running = false;
        node.unregisterRouter(ctx.self());
        socket.destroy();
        ctx.die('disconnect');
    });
    //encoder.pipe(socket);

    const parser = makeParser(node, { ERTF });
    parser.write(leadChunk);
    socket.pipe(parser);
    parser.on('data', (data) => {
        log(ctx, '_handleSocket(%o) : parser.on(data, %o)', ctx.self(), data);
        if (data.type === 'heartbeat') {
            const message = Buffer.alloc(4, 0);
            log(
                ctx,
                '_handleSocket(%o) : parser.on(data, %o) : encoder.write(%o)',
                ctx.self(),
                data,
                message
            );
            encoder.write({ heartbeat: true });
        } else {
            receive(data.control, data.message);
        }
    });

    recycle();

    function recycle() {
        if (running) {
            ctx.receive()
                .then(process)
                .then(recycle)
                .catch((err) => log(ctx, 'recycle() : error : %o', err));
        }
    }
}
