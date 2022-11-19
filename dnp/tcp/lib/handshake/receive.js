"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = receive;

var _common = require("./common");

var Flags = _interopRequireWildcard(require("../flags"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

async function receive(node, ctx, socket, options) {
  const {
    inCookie,
    outCookie
  } = options;
  let challenge = null;
  let nodeInformation = null;
  const log = ctx.log.extend('transports:ertf:handshake:receive');
  const chunk = await (0, _common.waitForChunk)(ctx, socket);
  log('_receiveHandshake() : chunk : %o', chunk);

  switch (String.fromCharCode(chunk.readUInt8(2))) {
    case 'n':
      {
        nodeInformation = receiveV5Handshake(chunk);
        await respondV5Handshake();
        break;
      }

    case 'N':
      {
        nodeInformation = receiveV6Handshake(chunk);
        await respondV6Handshake();
        break;
      }

    default:
      throw Error(`invalid handshake: ${chunk}`);
  }

  if (nodeInformation.flags & Flags.HANDSHAKE_23) {
    challenge = issueV6Challenge;
  } else {
    challenge = issueV5Challenge;
  }

  const sum = await challenge(ctx, socket, typeof node.name === 'symbol' ? Symbol.keyFor(node.name) : node.name, (0, _common.ourFlags)(node), outCookie);
  const incomingChallenge = await receiveChallengeResponse(sum);
  await _answerIncomingChallenge(incomingChallenge);
  return nodeInformation;

  async function receiveV5Handshake(chunk) {
    const flags = chunk.readUInt32BE(4);
    const name = chunk.slice(9).toString('utf8');
    return {
      flags,
      name
    };
  }

  function respondV5Handshake() {
    const message = Buffer.alloc(5);
    message.writeUInt16BE(3, 0);
    message.write('sok', 2, 'utf8');
    log('respondV5Handshake(%o)', message);
    socket.write(message);
  }

  function receiveV6Handshake(chunk) {
    const flags = chunk.readBigUInt64BE(1);
    const creation = chunk.readUInt32BE(9);
    const nameLength = chunk.readUInt16BE(13);
    const name = chunk.slice(15, 15 + nameLength);
    let flagArray = [];

    for (let flag in Flags) {
      log('receiveV6Handshake(flag: %o, bit: 0x%s, set: %o)', flag, Flags[flag].toString(16), (Flags[flag] & flags) > 0n);

      if ((Flags[flag] & flags) > 0n) {
        flagArray.push(flag);
      }
    }

    log('receiveV6Handshake(flags: 0x%s, flagArray: %O)', flags.toString(16), flagArray);
    return {
      flags,
      creation,
      name
    };
  }

  async function respondV6Handshake() {
    return new Promise(resolve => {
      const message = Buffer.alloc(5);
      message.writeUInt16BE(3, 0);
      message.write('sok', 2, 'utf8');
      socket.write(message, resolve);
    });
  }

  async function receiveChallengeResponse(sum) {
    log('receiveChallengeResponse(%o)', sum);
    const chunk = await (0, _common.waitForChunk)(ctx, socket);
    log('receiveChallengeResponse(%o) : chunk : %o', sum, chunk);
    assert(String.fromCharCode(chunk.readUInt8(2)) === 'r');
    const challenge = chunk.readUInt32BE(3);
    const digest = chunk.slice(7);

    if (Buffer.compare(sum, digest) !== 0) {
      throw Error(`invalid challenge response: ${digest.toString('hex')}`);
    }

    return challenge;
  }

  async function _answerIncomingChallenge(challenge) {
    log('answerIncomingChallenge(challenge: %o)', challenge);
    const answer = (0, _common.computeChallenge)(challenge, inCookie);
    log('answerIncomingChallenge(answer: %o)', answer);
    const message = Buffer.alloc(19);
    message.writeUInt16BE(17, 0);
    message.writeUInt8('a'.charCodeAt(0), 2);
    message.write(answer.toString('binary'), 3, 'binary');
    log('answerIncomingChallenge(message: %o)', message);
    return new Promise(resolve => socket.write(message, resolve));
  }

  async function issueV5Challenge(ctx, socket, name, flags, inCookie) {
    const challenge = crypto.randomBytes(4);
    const buffer = Buffer.alloc(13 + Buffer.byteLength(name, 'utf8'));
    buffer.writeUint16BE(buffer.length - 2);
    buffer.writeUInt8('n'.charCodeAt(0), 2);
    buffer.writeUInt16BE(5, 3);
    buffer.writeUInt32BE(Number(BigInt.asUintN(32, flags)), 5);
    buffer.set(challenge, 9);
    buffer.write(name, 13, 'utf8');
    log('issueV5Challenge(%o)', buffer);
    socket.write(buffer, () => log('issueV5Challenge(%o) : drained', buffer));
    return (0, _common.computeChallenge)(challenge.readUInt32BE(0), inCookie);
  }

  async function issueV6Challenge(ctx, socket, name, flags, inCookie) {
    const challenge = crypto.randomBytes(4);
    log('issueV6Challenge(name: %o, challenge: %o, flags: %s)', name, challenge, flags.toString(16));
    const buffer = Buffer.alloc(19 + Buffer.byteLength(name, 'utf8'));
    buffer.writeUInt8('N'.charCodeAt(0), 0);
    buffer.writeBigUInt64BE(flags, 1);
    buffer.set(challenge, 9);
    buffer.writeUInt32BE(0, 13);
    buffer.writeUInt16BE(Buffer.byteLength(name, 'utf8'), 17);
    buffer.write(name, 19, 'utf8');
    await new Promise(resolve => {
      socket.write(buffer, resolve);
    });
    log('issueV6Challenge(buffer: %o) : written', buffer);
    return (0, _common.computeChallenge)(challenge.readUInt32BE(0), inCookie);
  }
}