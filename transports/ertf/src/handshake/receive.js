import {
    makeLengthScanner,
    computeChallenge,
    waitForChunk,
    ourFlags,
} from './common';
export default async function receive(
    node,
    ctx,
    socket,
    lengthScanner,
    options
) {
    const { inCookie, outCookie } = options;
    let challenge = null;
    socket.pipe(lengthScanner, { end: false });
    const chunk = await waitForChunk(ctx, lengthScanner);
    log(ctx, '_receiveHandshake() : chunk : %o', chunk);

    switch (String.fromCharCode(chunk.readUInt8(2))) {
        case 'n': {
            const { flags, name } = receiveV5Handshake(chunk);
            await respondV5Handshake();
            challenge = issueV5Challenge;
            break;
        }
        case 'N': {
            const { flags, name } = receiveV6Handshake(chunk);
            await respondV6Handshake();
            challenge = issueV6Challenge;
            break;
        }
        default:
            throw Error(`invalid handshake: ${chunk}`);
    }

    const sum = challenge(
        ctx,
        socket,
        Symbol.keyFor(node.name),
        ourFlags(node),
        inCookie
    );

    const incomingChallenge = await receiveChallengeResponse(sum);
    await _answerIncomingChallenge(incomingChallenge);

    async function receiveV5Handshake(chunk) {
        const flags = chunk.readUInt32BE(4);
        const name = chunk.slice(9).toString('utf8');
        return { flags, name };
    }
    function respondV5Handshake() {
        const message = Buffer.alloc(5);
        message.writeUInt16BE(3, 0);
        message.write('sok', 2, 'utf8');
        log(ctx, 'respondV5Handshake(%o)', message);
        socket.write(message);
    }

    function receiveV6Handshake(chunk) {
        const flags = chunk.readBigUInt64BE(1);
        const creation = chunk.readUInt32BE(9);
        const nameLength = chunk.readUInt16BE(13);
        const name = chunk.slice(15, 15 + nameLength);

        return { flags, creation, name };
    }
    function respondV6Handshake() {
        socket.write(Buffer.from('sok'));
    }

    async function receiveStatus() {
        const status = await waitForChunk(ctx, lengthScanner);
        assert(status.readUInt8(0) === 's'.charCodeAt(0));
        const response = status.slice(1);

        if (response.toString('utf8') !== 'true') {
            throw Error(`connection rejected: ${response}`);
        }
    }

    async function receiveChallengeResponse(sum) {
        log(ctx, 'receiveChallengeResponse(%o)', sum);
        const chunk = await waitForChunk(ctx, lengthScanner);
        log(ctx, 'receiveChallengeResponse(%o) : chunk : %o', sum, chunk);
        assert(String.fromCharCode(chunk.readUInt8(0)) === 'r');
        const challenge = chunk.readUInt32BE(1);
        const digest = chunk.slice(5);

        if (Buffer.compare(sum, digest) !== 0) {
            throw Error(
                `invalid challenge response: ${digest.toString('hex')}`
            );
        }

        return challenge;
    }

    async function _answerIncomingChallenge(challenge) {
        const answer = computeChallenge(challenge, outCookie);
        const message = Buffer.alloc(17);
        message.writeUInt8('a'.charCodeAt(0), 0);
        message.write(answer.toString('binary'), 1, 'binary');
        socket.write(message);
    }
}

function issueV5Challenge(ctx, socket, name, flags, inCookie) {
    const challenge = crypto.randomBytes(4).readUInt32BE(0);
    const buffer = Buffer.alloc(13 + Buffer.byteLength(name, 'utf8'));
    buffer.writeUint16BE(buffer.length - 2);
    buffer.writeUInt8('n'.charCodeAt(0), 2);
    buffer.writeUInt16BE(5, 3);
    buffer.writeUInt32BE(Number(BigInt.asUintN(32, flags)), 5);
    buffer.write(challenge, 9, 'utf8');
    buffer.write(name, 13, 'utf8');
    log(ctx, 'issueV5Challenge(%o)', buffer);
    socket.write(buffer, () =>
        log(ctx, 'issueV5Challenge(%o) : drained', buffer)
    );

    return computeChallenge(challenge, inCookie);
}
function issueV6Challenge(ctx, socket, name, flags, inCookie) {
    const challenge = crypto.randomBytes(4).readUInt32BE(0);
    const buffer = Buffer.alloc(19 + Buffer.byteLength(name, 'utf8'));
    buffer.writeUInt8('N'.charCodeAt(0), 0);
    buffer.writeBigUInt64BE(flags, 1);
    buffer.write(challenge, 9, 'utf8');
    buffer.writeUInt32BE(0, 13);
    buffer.writeUInt16BE(Buffer.byteLength(name), 17);
    buffer.write(name, 19, 'utf8');

    return computeChallenge(challenge, inCookie);
}
