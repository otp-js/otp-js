import { Pid, Ref } from '@otpjs/core';
import debug from 'debug';

const log = debug('otpjs:transports:ertf:parser:term');
const atom_cache = Symbol.for('atom_cache');

const parsers = new Map([
    [82, parseCachedAtom],
    [97, parseSmallInt],
    [98, parseInt],
    [99, parseFloatString],
    [88, parsePid],
    [104, parseTuple],
    [105, parseLargeTuple],
    [116, parseMap],
    [106, parseNil],
    [107, parseString],
    [108, parseList],
    [109, parseBinary],
    [110, parseSmallBigNum],
    [111, parseLargeBigNum],
    [90, parseRef],
    [70, parseBetterFloat],
    [118, parseUTF8Atom],
    [119, parseSmallUTF8Atom],
]);

export async function parseTerm(buff, atomCache) {
    const termType = buff.readUInt8(0);

    if (termType === 131) {
        return [null, buff];
    }

    const parser = parsers.get(termType);

    log('parseTerm(%o) : parser : %o', buff, parser);
    log('parseTerm(%o) : atomCache : %o', buff, atomCache);
    buff = buff.slice(1);

    return parser(buff, atomCache);
}

async function parseCachedAtom(buff, atomCache) {
    const atomCacheReferenceIndex = buff.readUInt8(0);
    log(
        'parseCachedAtom(atomCacheReferenceIndex: %o)',
        atomCacheReferenceIndex
    );
    const term = Symbol.for(atomCache[atomCacheReferenceIndex][1]);
    return [term, buff.slice(1)];
}
async function parseSmallInt(buff, atomCache) {
    const term = buff.readUInt8(0);
    return [term, buff.slice(1)];
}
async function parseInt(buff, atomCache) {
    const term = buff.readInt32BE(1);
    return [term, buff.slice(5)];
}
async function parseFloatString(buff, atomCache) {
    const term = parseFloat(buff.read(31, 1, 'utf8'));
    return [term, buff.slice(32)];
}
async function parsePid(buff, atomCache) {
    const [node, buff2] = await parseTerm(buff, atomCache);
    const id = buff2.readUInt32BE(0);
    const serial = buff2.readUInt32BE(4);
    const creation = buff2.readUInt32BE(8);
    const term = Pid.of(id, serial, creation);
    return [term, buff2.slice(12)];
}
async function parseRef(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    const [node, buff2] = await parseTerm(buff.slice(2), atomCache);
    const id = buff2.readUInt32BE(0);
    const creation = buff2.readUInt32BE(0);
    const ids = new Array(length);

    for (let i = 0; i < ids; i++) {
        const id = buff.readUInt32BE(0);
        buff = buff.slice(4);
        ids[i] = id;
    }

    return [ids, buff];
}
async function parseTuple(buff, atomCache) {
    const arity = buff.readUInt8(0);
    const term = new Array(arity);
    buff = buff.slice(1);
    for (let i = 0; i < arity; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache);
        term[i] = element;
        buff = nextBuff;
    }
    return [term, buff];
}
async function parseLargeTuple(buff, atomCache) {
    const arity = buff.readUInt32BE(0);
    const term = new Array(arity);
    buff = buff.slice(4);
    for (let i = 0; i < arity; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache);
        term[i] = element;
        buff = nextBuff;
    }
    return [term, buff];
}
async function parseMap(buff, atomCache) {
    const arity = buff.readUInt32BE(0);
    const term = new Array(arity);
    buff = buff.slice(4);
    for (let i = 0; i < arity; i++) {
        const [key, buff2] = await parseTerm(buff, atomCache);
        const [value, buff3] = await parseTerm(buff2);
        term[i] = [key, value];
        buff = buff3;
    }
    return [term, buff];
}
async function parseNil(buff, atomCache) {
    return [[], buff];
}
async function parseString(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    return [buff.read(length, 2, 'utf8'), buff.slice(2 + length)];
}
async function parseBinary(buff, atomCache) {
    const length = buff.readUInt32BE(0);
    return [buff.slice(4, 4 + length), buff.slice(4 + length)];
}
async function parseSmallBigNum(buff, atomCache) {
    let value = 0n;
    let count = buff.readUInt8(0);
    let sign = buff.readUInt8(1);
    let digits = buff.slice(2, 2 + count);

    for (let i = 0; i < count; i++) {
        const byte = BigInt(digits.readUInt8(i));
        value += byte * 256n ** BigInt(i);
    }

    return [value, buff.slice(2 + count)];
}
async function parseLargeBigNum(buff, atomCache) {
    let value = 0n;
    let count = buff.readUInt32BE(0);
    let sign = buff.readUInt8(4);
    let digits = buff.slice(5, 5 + count);

    for (let i = 0; i < count; i++) {
        const byte = BigInt(buff.readUInt8(i));
        value += byte * 256n ** BigInt(i);
    }

    if (sign) {
        value = 0n - value;
    }

    return [value, buff.slice(5 + count)];
}
async function parseBetterFloat(buff, atomCache) {
    const float = buff.readDoubleBE(0);
    return [float, buff.slice(8)];
}
async function parseUTF8Atom(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    const atom = buff.read(length, 2, 'utf8');
    return [atom, buff.slice(2 + length)];
}
async function parseSmallUTF8Atom(buff, atomCache) {
    const length = buff.readUInt8(0);
    const atom = buff.read(length, 1, 'utf8');
    return [atom, buff.slice(1 + length)];
}
async function parseList(buff, atomCache) {
    const length = buff.readUInt32BE(0);
    const list = new Array(length);

    for (let i = 0; i < length; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache);
        list[i] = element;
        buff = nextBuff;
    }

    const [tail, nextBuff] = await parseTerm(buff, atomCache);
    list.tail = tail;
    return [list, nextBuff];
}
