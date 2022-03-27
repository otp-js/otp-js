import { Transform } from 'stream';
import * as serializer from '@otpjs/serializer-ertf';
import debug from 'debug';
//import { parseDistributionHeader } from './distribution-header';

const log = debug('otpjs:transports:tcp:parser');

function defaultOptions(node) {
    return {
        atomCache: [],
        ERTF: serializer.make(node),
    };
}

export default function make(node, options = defaultOptions(node)) {
    const { ERTF } = options;
    let { atomCache } = options;
    let cache = Buffer.from('', 'utf8');

    const transformer = new Transform({
        readableObjectMode: true,
        async transform(chunk, encoding, callback) {
            let buff = Buffer.concat([cache, chunk]);

            while (buff.length >= 4) {
                let length = buff.readUInt32BE(0);
                if (length == 0) {
                    buff = buff.subarray(4);
                    this.push({ type: 'heartbeat' });
                } else if (buff.length >= length + 4) {
                    const message = buff.subarray(4, 4 + length);
                    buff = buff.subarray(4 + length);

                    log('transform(message: %o)', message);

                    await consume(message, options);
                } else {
                    break;
                }
            }

            cache = buff;

            callback(null);
        },
    });

    return transformer;

    async function consume(buff) {
        const type = buff.readUInt8(0);
        if (type === 0x83) {
            // TODO: reenable distribution header
            // const [header, buff2] = await parseDistributionHeader(buff);
            // const { options: nextAtomCache } = header;
            // atomCache = [...atomCache, ...nextAtomCache].slice(-256);
            // log('consume(%o) : distributionHeader : %o', buff2, header);
            // const [controlMessage, buff3] = await ERTF.parse(buff2);
            // log('consume(%o) : controlMessage : %o', buff3, controlMessage);
            // const [message, remainder] = await ERTF.parse(buff3);
            // log('consume(%o) : message : %o', remainder, message);
            // transformer.push({ header, controlMessage, message });
            // return options;
        } else if (type === 0x70) {
            const header = {};
            const [control, buff2] = await ERTF.parse(buff.subarray(1));
            const [message, buff3] = await ERTF.parse(buff2);
            transformer.push({ header, control, message });
            return options;
        }
    }
}
