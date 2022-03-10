import { Transform } from 'stream';
import { parseTerm } from './term';
import { parseDistributionHeader } from './distribution-header';

function log(...formatters) {
    ctx.log.extend('transports:ertf:parser')(...formatters);
}

export default function make(ctx) {
    let cache = Buffer.from('', 'utf8');
    const log = ctx.log.extend('transports:ertf:parser');
    const transformer = new Transform({
        objectMode: true,
        async transform(chunk, encoding, callback) {
            let buff = Buffer.concat([cache, chunk]);

            while (buff.length >= 2) {
                let length = buff.readUInt16BE(0);
                if (length == 0) {
                    buff = buff.slice(2);
                    this.push({ type: 'heartbeat' });
                } else if (buff.length >= length + 2) {
                    await consume(buff.slice(2, 2 + length));
                    buff = buff.slice(2 + length);
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
        const [header, buff2] = await parseDistributionHeader(buff);
        const { atomCache } = header;
        log('consume(%o) : distributionHeader : %o', buff2, header);
        const [controlMessage, buff3] = await parseTerm(buff2, atomCache);
        log('consume(%o) : controlMessage : %o', buff3, controlMessage);
        const [message, remainder] = await parseTerm(buff3, atomCache);
        log('consume(%o) : message : %o', remainder, message);
        transformer.push({ header, controlMessage, message });
    }
}
