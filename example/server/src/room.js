import * as otp from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const { ok, _ } = otp.Symbols;
const { reply, noreply } = gen_server.Symbols;

const callbacks = {
    async init(ctx) {
        const messages = [];
        const subscribers = [];
        return [ok, { messages, subscribers }];
    },
    async handleCast(ctx, cast, state) {
        const compare = core.caseOf(cast);

        if (compare(['message', _, _])) {
            const [, from, message] = cast;
            const { messages } = state;
            const nextMessages = [...messages, { from, message }]
            const nextState = { ...state, messages: nextMessages };

            await _notifySubscribers(ctx, from, message, state.subscribers);

            return [noreply, nextState];
        } else if (compare(['subscribe', otp.Pid.isPid])) {
            const [, pid] = cast;
            const { subscribers } = state;
            const nextSubscribers = [...subscribers, pid];
            const nextState = { ...state, subscribers: nextSubscribers };

            await _initializeSubscriber(ctx, pid, state.messages);

            return [noreply, nextState];
        }
    }
}

async function _notifySubscribers(ctx, from, message, subscribers) {
    for (let subscriber of subscribers) {
        ctx.send(subscriber, ['message', ctx.self(), from, message]);
    }
}

async function _initializeSubscriber(ctx, subscriber, messages) {
    for (let [from, message] of messages) {
        ctx.send(subscriber, ['message', ctx.self(), from, message]);
    }
}

export function startLink(ctx, name) {
    return gen_server.startLink(ctx, name, callbacks);
}

export function subscribe(ctx, pidOrName) {
    const self = ctx.self();
    return gen_server.cast(ctx, pidOrName, ['subscribe', self]);
}

export function message(ctx, pidOrName, message) {
    const self = ctx.self();
    return gen_server.cast(ctx, pidOrName, ['message', self, message]);
}
