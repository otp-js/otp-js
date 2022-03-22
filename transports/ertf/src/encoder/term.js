import { Pid, Ref, List, Tuple } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import debug from 'debug';

const log = debug('otpjs:transports:ertf:encoder:term');
const atom_cache = Symbol.for('atom_cache');

const isAtom = (v) => typeof v === 'symbol';
const isInteger = (v) => Number.isInteger(v);
const isFloat = (v) =>
    !Number.isInteger(v) && Number.isFinite(v) && typeof v === 'number';
const isBigInt = (v) => typeof v === 'bigint';
const isString = (v) => typeof v === 'string';

export function encodeTerm(term, options) {
    const [buff, options2] = _encode(term, options);
    return Buffer.concat([Buffer.from([131]), buff]);
}

export const _encode = matching.clauses((route) => {
    route(isAtom, _).to(encodeAtom);
    route(isInteger, _).to(encodeInteger);
    route(isFloat, _).to(encodeFloat);
    route(isBigInt, _).to(encodeBigInt);
    //route(isString, _).to(encodeStringAsBinary);
    route(Pid.isPid, _).to(encodePid);
    route(Ref.isRef, _).to(encodeRef);
    route(List.nil, _).to(encodeNil);
    route(List.isList, _).to(encodeList);
    route(Tuple.isTuple, _).to(encodeTuple);
});

function encodeAtom(term, options) {
    const stringValue = Symbol.keyFor(term);
    const byteLength = Buffer.byteLength(stringValue, 'utf8');
    if (byteLength >= 256) {
        const buff = Buffer.alloc(
            1 + 4 + Buffer.byteLength(stringValue, 'utf8')
        );
        buff.writeUInt8(118, 0);
        buff.writeUInt32BE(byteLength, 1);
        buff.write(stringValue, 4, 'utf8');

        return [buff, options];
    } else {
        const buff = Buffer.alloc(2 + byteLength);
        buff.writeUInt8(118, 0);
        buff.writeUInt8(byteLength, 1);
        buff.write(stringValue, 2, 'utf8');

        return [buff, options];
    }
}
function encodeInteger(term, options) {
    const bits = Math.log2(term);

    if (bits <= 8) {
        const buff = Buffer.alloc(2);
        buff.writeUInt8(97, 0);
        buff.writeInt8(term, 1);
        return [buff, options];
    } else if (bits <= 32) {
        const buff = Buffer.alloc(5);
        buff.writeUInt8(98, 0);
        buff.writeInt32BE(term, 1);
        return [buff, options];
    } else if (bits > 32) {
        return encodeBigInt(BigInt(term), options);
    }
}
function encodeFloat(term, options) {
    const buff = Buffer.alloc(9);
    buff.writeUInt8(70, 0);
    buff.writeDoubleBE(term, 1);
    return [buff, options];
}
function encodeBigInt(term, options) {
    const bits = _ilog2(term);
    const bytes = Math.ceil(bits / 8);
    const sign = term < 0n;

    if (bytes < 256) {
        let buff = Buffer.alloc(1 + 1 + 1 + bytes);
        buff.writeUint8(110, 0);
        buff.writeUInt8(bytes, 1);
        buff.writeUInt8(sign, 2);
        for (let i = 0, offset = 3; i < bytes; i++, offset++) {
            const value = term >> ((bytes - i) * 8);
            buff.writeUInt8(term, offset);
        }
        return [buff, options];
    } else {
        let buff = Buffer.alloc(1 + 4 + 1 + bytes);
        buff.writeUint8(111, 0);
        buff.writeUInt32BE(bytes, 1);
        buff.writeUInt8(sign, 5);
        for (let i = 0, offset = 6; i < bytes; i++, offset++) {
            const value = term >> BigInt((bytes - i) * 8);
            buff.writeUInt8(value, offset);
        }
        return [buff, options];
    }
}
function encodePid(term, options) {
    const { node, id, serial, creation } = term;
    const nodeSymbol = options.node.getRouterName(node);
    const nodeBuff = encodeTerm(nodeSymbol, options);
    const buff = Buffer.alloc(1 + nodeBuff.length + 4 + 4 + 4);

    buff.writeUInt8(88, 0);
    nodeBuff.copy(buff, 1);
    buff.writeUInt32BE(id, 1 + nodeBuff.length);
    buff.writeUInt32BE(serial, 5 + nodeBuff.length);
    buff.writeUInt32BE(creation, 9 + nodeBuff.length);

    return [buff, options];
}
function encodeRef(_term, options) {
    return [Buffer.alloc(0), options];
}
function encodeNil(_term, _options) {
    return Buffer.from([106]);
}
function encodeList(term, options) {
    let length = 0;
    let node = term;
    let encodedTerms = [];

    while (List.isList(node) && node != nil) {
        const [encodedTerm, _nextOptions] = encodeTerm(node.head, options);
        encodedTerms.push(encodedTerm);
        node = node.tail;
        length++;
    }

    encodedTerms.push(encodeTerm(node.tail));

    const leader = Buffer.alloc(5);
    leader.writeUInt8(108, 0);
    leader.writeUInt32BE(length, 1);
    encodedTerms.unshift(leader);

    return [Buffer.concat(encodedTerms), options];
}
function encodeTuple(term, options) {
    let encodedTerms = [];
    for (let i = 0; i < term.size; i++) {
        const [encodedTerm, _options] = encodeTerm(term.get(i), options);
        encodedTerms.push(encodeTerm);
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

    return [Buffer.concat(encodedTerms), options];
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
