import * as otp from "@otpjs/core";
import * as supervisor from "@otpjs/supervisor";
import * as client from './client';

const { ok, _ } = otp.Symbols;
const { simple_one_for_one } = supervisor.Symbols;

const callbacks = {
    async init(_ctx, _parent) {
        return [
            ok,
            [
                { strategy: simple_one_for_one },
                [
                    {
                        start: [client.startLink, []]
                    }
                ]
            ]
        ]
    }
}

export function startLink(ctx) {
    return supervisor.startLink(ctx, 'clients', callbacks);
}

export function attach(ctx, socket) {
    return supervisor.startChild(ctx, 'clients', [socket]);
}
