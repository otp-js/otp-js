import { Pid, Ref, tuple, t, list, l, il } from '@otpjs/types';
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

export async function parseTerm(buff, atomCache, skipLeader = true) {
    const startAt = skipLeader ? 1 : 0;
    const termType = buff.readUInt8(startAt);
    const parser = parsers.get(termType);

    log(
        'parseTerm(buff: %o, termType: %o, parser: %o)',
        buff,
        termType,
        parser
    );
    buff = buff.subarray(startAt + 1);

    return parser(buff, atomCache);
}

async function parseCachedAtom(buff, atomCache) {
    const atomCacheReferenceIndex = buff.readUInt8(0);
    log(
        'parseCachedAtom(atomCacheReferenceIndex: %o)',
        atomCacheReferenceIndex
    );
    const term = Symbol.for(atomCache[atomCacheReferenceIndex][1]);
    return [term, buff.subarray(1)];
}
async function parseSmallInt(buff, atomCache) {
    const term = buff.readUInt8(0);
    return [term, buff.subarray(1)];
}
async function parseInt(buff, atomCache) {
    const term = buff.readInt32BE(0);
    return [term, buff.subarray(4)];
}
async function parseFloatString(buff, atomCache) {
    const term = parseFloat(buff.read(31, 1, 'utf8'));
    return [term, buff.subarray(32)];
}
async function parsePid(buff, atomCache) {
    const [node, buff2] = await parseTerm(buff, atomCache, false);
    const id = buff2.readUInt32BE(0);
    const serial = buff2.readUInt32BE(4);
    const creation = buff2.readUInt32BE(8);
    const term = Pid.of(id, serial, creation);
    return [term, buff2.subarray(12)];
}
async function parseRef(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    const [node, buff2] = await parseTerm(buff.subarray(2), atomCache, false);
    const id = buff2.readUInt32BE(0);
    const creation = buff2.readUInt32BE(0);
    const ids = new Array(length);

    for (let i = 0; i < ids; i++) {
        const id = buff.readUInt32BE(0);
        buff = buff.subarray(4);
        ids[i] = id;
    }

    return [ids, buff];
}
async function parseTuple(buff, atomCache) {
    const arity = buff.readUInt8(0);
    const term = tuple.create(arity);
    buff = buff.subarray(1);
    for (let i = 0; i < arity; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache, false);
        term.set(i, element);
        buff = nextBuff;
    }
    return [t(...term), buff];
}
async function parseLargeTuple(buff, atomCache) {
    const arity = buff.readUInt32BE(0);
    const term = tuple.create(arity);
    buff = buff.subarray(4);
    for (let i = 0; i < arity; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache, false);
        term.set(i, element);
        buff = nextBuff;
    }
    return [term, buff];
}
async function parseMap(buff, atomCache) {
    const arity = buff.readUInt32BE(0);
    const term = new Array(arity);
    buff = buff.subarray(4);
    for (let i = 0; i < arity; i++) {
        const [key, buff2] = await parseTerm(buff, atomCache, false);
        const [value, buff3] = await parseTerm(buff2, atomCache, false);
        term[i] = [key, value];
        buff = buff3;
    }
    return [term, buff];
}
async function parseNil(buff, atomCache) {
    return [list.nil, buff];
}
async function parseString(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    return [l(...buff.subarray(2, 2 + length)), buff.subarray(2 + length)];
}
async function parseBinary(buff, atomCache) {
    const length = buff.readUInt32BE(0);
    return [buff.subarray(4, 4 + length), buff.subarray(4 + length)];
}
async function parseSmallBigNum(buff, atomCache) {
    let value = 0n;
    let count = buff.readUInt8(0);
    let sign = buff.readUInt8(1);
    let digits = buff.subarray(2, 2 + count);

    for (let i = 0; i < count; i++) {
        const byte = BigInt(digits.readUInt8(i));
        value += byte * 256n ** BigInt(i);
    }

    if (sign) {
        value = 0n - value;
    }

    return [value, buff.subarray(2 + count)];
}
async function parseLargeBigNum(buff, atomCache) {
    let value = 0n;
    let count = buff.readUInt32BE(0);
    let sign = buff.readUInt8(4);
    let digits = buff.subarray(5, 5 + count);

    for (let i = 0; i < count; i++) {
        const byte = BigInt(buff.readUInt8(i));
        value += byte * 256n ** BigInt(i);
    }

    if (sign) {
        value = 0n - value;
    }

    return [value, buff.subarray(5 + count)];
}
async function parseBetterFloat(buff, atomCache) {
    const float = buff.readDoubleBE(0);
    return [float, buff.subarray(8)];
}
async function parseUTF8Atom(buff, atomCache) {
    const length = buff.readUInt16BE(0);
    const atom = buff.read(length, 2, 'utf8');
    return [atom, buff.subarray(2 + length)];
}
async function parseSmallUTF8Atom(buff, atomCache) {
    const buffer = Buffer.from('test', 'utf8');
    buffer;
    const length = buff.readUInt8(0);
    const atom = String(buff.subarray(1, 1 + length));
    return [Symbol.for(atom), buff.subarray(1 + length)];
}
async function parseList(buff, atomCache) {
    const length = buff.readUInt32BE(0);
    const list = new Array(length);
    buff = buff.subarray(4);

    for (let i = 0; i < length; i++) {
        const [element, nextBuff] = await parseTerm(buff, atomCache, false);
        list[i] = element;
        buff = nextBuff;
    }

    const [tail, nextBuff] = await parseTerm(buff, atomCache, false);
    list.tail = tail;
    return [il(...list, tail), nextBuff];
}
