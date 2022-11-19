"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = make;

var _types = require("@otpjs/types");

var matching = _interopRequireWildcard(require("@otpjs/matching"));

var _debug = _interopRequireDefault(require("debug"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const log = (0, _debug.default)('otpjs:transports:ertf:encoder:term');
const {
  _
} = matching.Symbols;
const atom_cache = Symbol.for('atom_cache');

const isAtom = v => typeof v === 'symbol';

const isInteger = v => Number.isInteger(v);

const isFloat = v => !Number.isInteger(v) && Number.isFinite(v) && typeof v === 'number';

const isBigInt = v => typeof v === 'bigint';

const isString = v => typeof v === 'string';

function make(env, options = {}) {
  const serializeTerm = matching.clauses(function serializeERTF(route) {
    route(isAtom).to(encodeAtom);
    route(isInteger).to(encodeInteger);
    route(isFloat).to(encodeFloat);
    route(isBigInt).to(encodeBigInt);
    route(isString).to(encodeString);
    route(_types.Pid.isPid).to(encodePid);
    route(_types.Ref.isRef).to(encodeRef);
    route(_types.List.nil).to(encodeNil);
    route(_types.List.isList).to(encodeList);
    route(_types.Tuple.isTuple).to(encodeTuple);
  });

  function serialize(term, options = {
    tag: true
  }) {
    const buff = serializeTerm(term);

    if (options.tag) {
      return Buffer.concat([Buffer.from([131]), buff]);
    } else {
      return buff;
    }
  }

  return serialize;

  function encodeAtom(term) {
    const stringValue = Symbol.keyFor(term);
    const byteLength = Buffer.byteLength(stringValue, 'utf8');

    if (byteLength >= 256) {
      const buff = Buffer.alloc(1 + 4 + Buffer.byteLength(stringValue, 'utf8'));
      buff.writeUInt8(118, 0);
      buff.writeUInt32BE(byteLength, 1);
      buff.write(stringValue, 4, 'utf8');
      return buff;
    } else {
      const buff = Buffer.alloc(2 + byteLength);
      buff.writeUInt8(119, 0);
      buff.writeUInt8(byteLength, 1);
      buff.write(stringValue, 2, 'utf8');
      return buff;
    }
  }

  function encodeInteger(term) {
    const bits = Math.log2(term);

    if (bits <= 8) {
      const buff = Buffer.alloc(2);
      buff.writeUInt8(97, 0);
      buff.writeInt8(term, 1);
      return buff;
    } else if (bits <= 32) {
      const buff = Buffer.alloc(5);
      buff.writeUInt8(98, 0);
      buff.writeInt32BE(term, 1);
      return buff;
    } else if (bits > 32) {
      return encodeBigInt(BigInt(term));
    }
  }

  function encodeFloat(term) {
    const buff = Buffer.alloc(9);
    buff.writeUInt8(70, 0);
    buff.writeDoubleBE(term, 1);
    return buff;
  }

  function encodeBigInt(term) {
    const bits = _ilog2(term);

    const bytes = bits / 8n + (bits % 8n > 0n ? 1n : 0n);
    const sign = term < 0n;

    if (bytes <= 4) {
      const number = Number(term);
      return encodeInteger(number);
    } else if (bytes < 256) {
      let buff = Buffer.alloc(1 + 1 + 1 + Number(bytes));
      buff.writeUint8(110, 0);
      buff.writeUInt8(Number(BigInt.asUintN(8, bytes)), 1);
      buff.writeUInt8(sign, 2);

      for (let i = 0, offset = 3; i < bytes; i++, offset++) {
        const mask = 0xffn;
        const byteOffset = BigInt(i);
        const bitOffset = byteOffset * 8n;
        const value = term >> bitOffset & mask;
        buff.writeUInt8(Number(value), offset);
      }

      return buff;
    } else {
      let buff = Buffer.alloc(1 + 4 + 1 + bytes);
      buff.writeUint8(111, 0);
      buff.writeUInt32BE(Number(BigInt.asUintN(32, bytes)), 1);
      buff.writeUInt8(sign, 5);

      for (let i = 0, offset = 6; i < bytes; i++, offset++) {
        const mask = 0xffn;
        const byteOffset = BigInt(i);
        const bitOffset = byteOffset * 8n;
        const value = term >> bitOffset & mask;
        buff.writeUInt8(value, offset);
      }

      return buff;
    }
  }

  function encodeString(term) {
    const length = Buffer.byteLength(term, 'binary');

    if (options.stringsAsBinaries) {
      const length = Buffer.byteLength(term);
      const buff = Buffer.alloc(5 + length);
      buff.writeUInt8(109, 0);
      buff.writeUInt32BE(length, 1);
      buff.write(term, 5, 'utf8');
      return buff;
    } else {
      if (length >= 65535) {
        return encodeList(_types.List.from(...term));
      } else {
        const encoded = Buffer.from(term, 'binary');
        const header = Buffer.alloc(1 + 2);
        header.writeUInt8(107, 0);
        header.writeUInt16BE(length, 1);
        return Buffer.concat([header, encoded]);
      }
    }
  }

  function encodePid(term) {
    const {
      node,
      id,
      serial,
      creation
    } = term;
    const nodeSymbol = env.getRouterName(node);
    const nodeBuff = serialize(nodeSymbol, {
      tag: false
    });
    const buff = Buffer.alloc(1 + nodeBuff.length + 4 + 4 + 4);
    buff.writeUInt8(88, 0);
    buff.write(nodeBuff.toString('binary'), 1, 'binary');
    buff.writeUInt32BE(id, 1 + nodeBuff.length);
    buff.writeUInt32BE(serial, 5 + nodeBuff.length);
    buff.writeUInt32BE(creation, 9 + nodeBuff.length);
    return buff;
  }

  function encodeRef(_term) {
    return Buffer.alloc(0);
  }

  function encodeNil(_term, _options) {
    return Buffer.from([106]);
  }

  function encodeList(term) {
    let length = 0;
    let node = term;
    let encodedTerms = [];

    while (_types.List.isList(node) && node != nil) {
      const encodedTerm = serialize(node.head, {
        tag: false
      });
      encodedTerms.push(encodedTerm);
      node = node.tail;
      length++;
    }

    encodedTerms.push(serialize(node.tail, {
      tag: false
    }));
    const leader = Buffer.alloc(5);
    leader.writeUInt8(108, 0);
    leader.writeUInt32BE(length, 1);
    encodedTerms.unshift(leader);
    return Buffer.concat(encodedTerms);
  }

  function encodeTuple(term) {
    let encodedTerms = [];

    for (let i = 0; i < term.size; i++) {
      const encodedTerm = serialize(term.get(i), {
        tag: false
      });
      encodedTerms.push(encodedTerm);
    }

    let leader;

    if (term.size < 256) {
      leader = Buffer.alloc(2);
      leader.writeUInt8(104, 0);
      leader.writeUInt8(term.size, 1);
    } else {
      leader = Buffer.alloc(5);
      leader.writeUInt8(104, 0);
      leader.writeUInt32BE(term.size, 1);
    }

    encodedTerms.unshift(leader);
    return Buffer.concat(encodedTerms);
  }

  function _ilog2(value) {
    let result = 0n;
    let i = 0n;
    let v = 0n;

    for (i = 1n; value >> (1n << i); i <<= 1n);

    while (value > 1n) {
      v = 1n << --i;

      if (value >> v) {
        result += v;
        value >>= v;
      }
    }

    return result;
  }
}