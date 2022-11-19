import { Transform } from 'stream';
import * as serializer from '@otpjs/serializer-ertf';
import debug from 'debug';

const log = debug('otpjs:transports:tcp:encoder');

function defaultOptions(node) {
    return {
        atomCache: [],
        ERTF: serializer.make(node),
    };
}

export default function make(node, options = defaultOptions(node)) {
    const { ERTF } = options;

    const transformer = new Transform({
        writableObjectMode: true,
        async transform(data, _encoding, callback) {
            log('transform(data: %o)', data);
            const { heartbeat, message, control } = data;
            if (heartbeat) {
                log('transform(heartbeat)');
                this.push(Buffer.alloc(4, 0));
                return;
            }

            let buff = ERTF.serialize(control, { tag: true });

            if (message) {
                let buff2 = ERTF.serialize(message, { tag: true });

                buff = Buffer.concat([buff, buff2]);
            }

            const length = Buffer.alloc(4);
            length.writeUInt32BE(buff.length + 1);
            const packet = Buffer.concat([length, Buffer.from([0x70]), buff]);
            log(
                'transform(packet: %o, control: %o, message: %o)',
                packet,
                control,
                message
            );
            this.push(packet);

            callback(null);
        },
    });

    return transformer;
}
