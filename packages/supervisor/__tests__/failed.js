import { l, OTPError } from '@otpjs/types';
import * as gen_server from '@otpjs/gen_server';

const callbacks = gen_server.callbacks((server) => {
    server.onInit(async function init(ctx, reason) {
        throw OTPError(reason);
    });
});

export function startLink(ctx, reason = 'error') {
    return gen_server.startLink(ctx, callbacks, l(reason));
}
