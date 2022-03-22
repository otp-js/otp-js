import { Transform } from 'stream';
import { encodeTerm } from './term';
import { encodeDistributionHeader } from './distribution-header';

function log(...formatters) {
    ctx.log.extend('transports:ertf:parser')(...formatters);
}

export default function make(ctx, node) {
    let atomCache = [];

    const transformer = new Transform({
        objectMode: true,
        async transform({ heartbeat, message, control }, encoding, callback) {
            if (heartbeat) {
                this.push(Buffer.alloc(2, 0));
                return;
            }

            let [buff, atomCache2] = encodeTerm(control, { node, atomCache });

            if (message) {
                let [buff2, atomCache3] = encodeTerm(message, {
                    node,
                    atomCache: atomCache2,
                });

                atomCache = atomCache3;

                buff = Buffer.concat([buff, buff2]);
            }

            this.push(Buffer.concat([0x83, 0x70, buff]));

            callback(null);
        },
    });

    return transformer;
}
