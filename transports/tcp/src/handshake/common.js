import { Transform } from 'stream';
import * as crypto from 'crypto';
import * as flags from '../flags';

function log(ctx, ...formatters) {
    return ctx.log.extend('transports:ertf:handshake:common')(...formatters);
}

export function ourFlags() {
    return (
        flags.BIG_CREATION +
        flags.DIST_MONITOR +
        flags.EXPORT_PTR_TAG +
        flags.EXTENDED_PIDS_PORTS +
        flags.EXTENDED_REFERENCES +
        flags.FUN_TAGS +
        flags.NEW_FUN_TAGS +
        flags.PUBLISHED +
        flags.UTF8_ATOMS +
        flags.HANDSHAKE_23
    );
}
export function waitForChunk(ctx, stream) {
    return new Promise((resolve, reject) => {
        log(ctx, '_waitForChunk() : wait');
        stream.once('data', (chunk, encoding, cb) => {
            log(ctx, '_waitForChunk() : chunk : %o', chunk);
            resolve(chunk);
            stream.off('error', reject);
        });
        stream.once('error', reject);
    });
}

export function computeChallenge(challenge, cookie) {
    const hash = crypto.createHash('md5');
    hash.update(String(cookie), 'utf8');
    hash.update(String(challenge), 'utf8');
    return hash.digest();
}

export function makeLengthScanner(ctx) {
    let cache = Buffer.from('', 'utf8');
    const scanner = new Transform({
        transform(chunk, encoding, cb) {
            scan(chunk, encoding);
            cb();
        },
    });
    return scanner;

    function scan(chunk, encoding) {
        chunk = Buffer.concat([cache, chunk]);
        log(ctx, 'scan(chunk: %o)', chunk);
        if (chunk.length >= 2) {
            const size = chunk.readUInt16BE(0);
            if (chunk.length - 2 >= size) {
                const message = chunk.slice(0, size + 2);
                log(ctx, 'scan(chunk: %o) : scanner.push(%o)', chunk, message);
                scanner.push(message);

                const remainder = chunk.slice(size + 2);
                setImmediate(() => scan(remainder, encoding));
            } else {
                cache = chunk;
            }
        } else {
            cache = chunk;
        }
    }
}
