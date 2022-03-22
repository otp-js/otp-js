import {
    makeLengthScanner,
    computeChallenge,
    waitForChunk,
    ourFlags,
} from './common';

function log(ctx, ...formatters) {
    return ctx.log.extend('transports:ertf:handshake:initiate')(...formatters);
}

export default async function initiate(
    node,
    ctx,
    socket,
    lengthScanner,
    options
) {
    const name = Symbol.keyFor(node.name);
    const { inCookie, outCookie } = options;
    const nodeInformation = {};
    const flags = ourFlags(node);

    log(ctx, 'connect() : ourFlags : %o', flags);

    socket.pipe(lengthScanner, { end: false });

    try {
        return new Promise((resolve, reject) => {
            function cleanAndReject(err) {
                socket.off('close', cleanAndReject);
                socket.off('error', cleanAndReject);
                socket.off('connect', onConnect);
                reject(err);
            }
            function onConnect() {
                socket.off('close', cleanAndReject);
                socket.off('error', cleanAndReject);
                initiateHandshakeV6().then(
                    () => resolve(nodeInformation),
                    reject
                );
            }
            socket.once('connect', onConnect);
            socket.once('close', reject);
            socket.once('error', reject);
        });
    } catch (err) {
        log(ctx, 'connect() : error : %o', err);
        ctx.die(err);
        throw err;
    }
    async function initiateHandshakeV6() {
        const message = Buffer.alloc(17 + Buffer.byteLength(name, 'utf8'), 0);
        message.writeUInt16BE(message.length - 2, 0);
        message.writeUInt8('N'.charCodeAt(0), 2);
        message.writeBigUInt64BE(flags, 3);
        message.writeUInt32BE(0, 11);
        message.writeUInt16BE(Buffer.byteLength(name, 'utf8'), 15);
        message.write(name, 17, 'utf8');
        log(ctx, 'initiateHandshake(%o)', message);
        socket.write(message, () =>
            log(ctx, 'initiateHandshake(%o) : written', message)
        );

        return awaitStatusResponse();
    }

    async function awaitStatusResponse() {
        log(ctx, 'awaitStatusResponse()');
        const chunk = await waitForChunk(ctx, lengthScanner);
        log(ctx, 'awaitStatusResponse() : chunk : %o', chunk);
        assert(String.fromCharCode(chunk.readUInt8(2)) === 's');
        const status = chunk.slice(3).toString('utf8');

        switch (status) {
            case 'ok':
            case 'ok_simultaneous':
                return continueHandshake();
            case 'nok':
            case 'not_allowed':
                return discontinueHandshake();
            case 'alive':
                await sendStatusMessage('true');
                return continueHandshake();
            default:
                throw Error(`invalid handshake status: ${status}`);
        }
    }

    async function discontinueHandshake() {
        log(ctx, 'discontinueHandshake()');
        socket.destroy();
    }

    async function continueHandshake() {
        log(ctx, 'continueHandshake()');
        const chunk = await waitForChunk(ctx, lengthScanner);
        log(ctx, 'continueHandshake() : chunk : %o', chunk);

        const flags = chunk.readBigUInt64BE(3);
        const challenge = chunk.readUInt32BE(11);
        const creation = chunk.readUInt32BE(15);
        const nameLength = chunk.readUInt16BE(19);
        const name = chunk.slice(21);
        nodeInformation.name = Symbol.for(name.toString('utf8'));
        nodeInformation.creation = creation;
        nodeInformation.flags = flags;

        log(ctx, 'continueHandshake() : nodeInformation : %o', nodeInformation);
        const answer = computeChallenge(challenge, outCookie);
        const ourChallenge = await sendChallengeResponse(answer);
        return receiveChallengeAcknowledgement(ourChallenge);
    }

    function validateAnswer(challenge, answer, cookie) {
        const ourAnswer = computeChallenge(challenge, cookie);
        assert(Buffer.compare(answer, ourAnswer) === 0);
    }

    async function sendChallengeResponse(answer) {
        const challenge = crypto.randomBytes(4).readUInt32BE(0);
        const message = Buffer.alloc(23);
        message.writeUInt16BE(message.length - 2, 0);
        message.writeUInt8('r'.charCodeAt(0), 2);
        message.writeUInt32BE(challenge, 3);
        log(ctx, 'sendChallengeResponse(%o) : answer : %o', message, answer);
        message.write(answer.toString('binary'), 7, 'binary');
        log(ctx, 'sendChallengeResponse(%o)', message);
        socket.write(message);

        return computeChallenge(challenge, outCookie);
    }

    async function receiveChallengeAcknowledgement(challenge) {
        log(ctx, 'receiveChallengeAcknowledgement()');
        const chunk = await waitForChunk(ctx, lengthScanner);
        log(ctx, 'receiveChallengeAcknowledgement() : chunk', chunk);
        assert(String.fromCharCode(chunk.readUInt8(2)) === 'a');
        const digest = chunk.slice(3);
        assert(digest.length == 16);
        assert(Buffer.compare(challenge, digest) === 0);

        return nodeInformation;
    }
}
