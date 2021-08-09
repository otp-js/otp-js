import * as otp from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as rooms from './rooms';

const { ok, _ } = otp.Symbols;
const { reply, noreply } = gen_server.Symbols;

const callbacks = {
    async init(ctx, socket) {
        const subscriptions = [];

        _installHandlers(ctx, socket);

        return [ok, { socket, subscriptions }];
    },
    async handleCall(ctx, call, from, state) {
        return [noreply, state];
    },
    async handleCast(ctx, cast, state) {
        const compare = otp.caseOf(cast);

        if (compare(['join', _])) {
            const [, name] = cast;
            return doJoin(ctx, name, state);
        } else if (compare(['leave', _])) {
            const [, name] = cast;
            return doLeave(ctx, name, state);
        }
    },
    async handleInfo(ctx, info, state) {
        return [noreply, state];
    }
}

async function doJoin(ctx, name, state) {
    if (state.subscriptions.includes(name)) {
        return [noreply, state];
    } else {
        await rooms.join(ctx, name);

        const nextSubscriptions = [
            ...state.subscriptions,
            name,
        ]
        const nextState = { ...state, subscriptions: nextSubscriptions };

        return [noreply, nextState];
    }
}

function _installHandlers(ctx, socket) {
    socket.on('set_from', (from) => _setFrom(ctx, from));
    socket.on('join', (roomName) => _join(ctx, roomName));
    socket.on('leave', (roomName) => _leave(ctx, roomName));
    socket.on('message', (roomName, message) => _message(ctx, roomName, message));
    socket.on('disconnect', () => ctx.exit(ctx.self(), 'disconnected'));
    socket.emit('who_are_you');
}

function _join(ctx, roomName) {
    return gen_server.cast(ctx, ctx.self(), ['join', roomName]);
}

function _leave(ctx, roomName) {
    return gen_server.cast(ctx, ctx.self(), ['leave', roomName]);
}

function _setFrom(ctx, from) {
    return gen_server.cast(ctx, ctx.self(), ['set_from', from]);
}

function _message(ctx, roomName, message) {
    return gen_server.cast(ctx, ctx.self(), ['message', roomName, message]);
}

export function startLink(ctx, socket) {
    return gen_server.startLink(ctx, callbacks, [socket]);
}
