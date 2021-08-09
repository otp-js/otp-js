import * as otp from '@otpjs/core';
import * as supervisor from '@otpjs/supervisor';
import * as rooms from './rooms';
import * as clients from './clients';

const { ok, _ } = otp.Symbols;
const { one_for_one } = supervisor.Symbols;

const callbacks = {
    async init(ctx, server) {
        _installHandlers(ctx, server);
        return [
            ok,
            [
                { strategy: one_for_one },
                [
                    {
                        id: 'rooms',
                        start: [rooms.startLink, [ctx.self()]],
                    },
                    {
                        id: 'clients',
                        start: [clients.startLink, [ctx.self()]]
                    }
                ]
            ]
        ]
    }
}

function _installHandlers(ctx, server) {
    server.on('connection', (socket) => {
        clients.attach(ctx, socket);
    });
}

export function startLink(ctx, server) {
    return supervisor.startLink(ctx, callbacks, server);
}
