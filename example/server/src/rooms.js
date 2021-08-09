import * as otp from "@otpjs/core";
import * as supervisor from "@otpjs/supervisor";
import * as room from './room';

const { ok, _ } = otp.Symbols;
const { simple_one_for_one } = supervisor.Symbols;

const callbacks = {
    async init(ctx, parent) {
        return [
            ok,
            [
                { strategy: simple_one_for_one },
                [
                    {
                        start: [room.startLink]
                    }
                ]
            ]
        ]
    }
}

export function startLink(ctx) {
    return supervisor.startLink(ctx, 'rooms', callbacks);
}

export async function join(ctx, roomName) {
    const pid = ctx.whereis(roomName);
    if (pid === undefined) {
        const [, pid] = await supervisor.startChild(ctx, 'rooms', [roomName]);
        return room.subscribe(ctx, roomName);
    } else {
        return room.subscribe(ctx, pid);
    }
}

export function leave(ctx, roomName) {
    return room.leave(ctx, roomName, ctx.self());
}
