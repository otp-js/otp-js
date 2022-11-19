"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.computeChallenge = computeChallenge;
exports.makeLengthScanner = makeLengthScanner;
exports.ourFlags = ourFlags;
exports.waitForChunk = waitForChunk;

var _stream = require("stream");

var crypto = _interopRequireWildcard(require("crypto"));

var flags = _interopRequireWildcard(require("../flags"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function log(ctx, ...formatters) {
  return ctx.log.extend('transports:ertf:handshake:common')(...formatters);
}

function ourFlags() {
  return flags.BIG_CREATION + flags.DIST_MONITOR + flags.EXPORT_PTR_TAG + flags.EXTENDED_PIDS_PORTS + flags.EXTENDED_REFERENCES + flags.FUN_TAGS + flags.NEW_FUN_TAGS + flags.PUBLISHED + flags.UTF8_ATOMS + flags.HANDSHAKE_23;
}

function waitForChunk(ctx, stream) {
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

function computeChallenge(challenge, cookie) {
  const hash = crypto.createHash('md5');
  hash.update(String(cookie), 'utf8');
  hash.update(String(challenge), 'utf8');
  return hash.digest();
}

function makeLengthScanner(ctx) {
  let cache = Buffer.from('', 'utf8');
  const scanner = new _stream.Transform({
    transform(chunk, encoding, cb) {
      scan(chunk, encoding);
      cb();
    }

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