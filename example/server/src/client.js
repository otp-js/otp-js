import * as otp from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
import * as rooms from './rooms';

const { ok, _ } = otp.Symbols;
const { reply, noreply } = gen_server.Symbols;

const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);
    server.onCast(['join', _], _join);
    server.onCast(['leave', _], _leave);
});
function _join(ctx, cast, state) {
    const [, name] = cast;
    if (state.subscriptions.includes(name)) {
        return [noreply, state];
    } else {
        await rooms.join(ctx, name);

        const nextSubscriptions = [...state.subscriptions, name];
        const nextState = { ...state, subscriptions: nextSubscriptions };

        return [noreply, nextState];
    }
}
function _leave(ctx, cast, state) {
    const [, name] = cast;
    const index = state.subscriptions.indexOf(name);
    if (index >= 0) {
        const subscriptions = [
            ...state.subscriptions.slice(0, index),
            ...state.subscriptions.slice(index + 1),
        ];
        const nextState = { ...state, subscriptions };
        return [noreply, nextState];
    } else {
        return [noreply, state];
    }
}

function _installHandlers(ctx, socket) {
    socket.on('set_from', (from) => _setFrom(ctx, from));
    socket.on('join', (roomName) => _join(ctx, roomName));
    socket.on('leave', (roomName) => _leave(ctx, roomName));
    socket.on('message', (roomName, message) =>
        _message(ctx, roomName, message)
    );
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
