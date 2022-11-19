import { Pid, Ref, tuple, t, list, l, il } from '@otpjs/types';
import debug from 'debug';

const log = debug('otpjs:transports:ertf:parser:term');

export default function make(env, options) {
    const parsers = new Map([
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

    return deserialize;

    function deserialize(buff) {
        let offset = 0;
        let startTerm = buff.readUInt8(offset);

        if (startTerm === 131) {
            offset++;
            startTerm = buff.readUInt8(offset);
        }

        const parser = parsers.get(startTerm);

        log(
            'parseTerm(buff: %o, startTerm: %o, parser: %o)',
            buff,
            startTerm,
            parser
        );
        buff = buff.subarray(offset + 1);

        return parser(buff);
    }

    function parseSmallInt(buff) {
        const term = buff.readUInt8(0);
        return [term, buff.subarray(1)];
    }
    function parseInt(buff) {
        const term = buff.readInt32BE(0);
        return [term, buff.subarray(4)];
    }
    function parseFloatString(buff) {
        const term = parseFloat(buff.read(31, 1, 'utf8'));
        return [term, buff.subarray(32)];
    }
    function parsePid(buff) {
        const [nodeSymbol, buff2] = deserialize(buff, false);
        const id = buff2.readUInt32BE(0);
        const serial = buff2.readUInt32BE(4);
        const creation = buff2.readUInt32BE(8);
        const nodeId = env.getRouterId(nodeSymbol);
        const term = new Pid(nodeId, id, serial, creation);
        return [term, buff2.subarray(12)];
    }
    function parseRef(buff) {
        const length = buff.readUInt16BE(0);
        const [node, buff2] = deserialize(buff.subarray(2), false);
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
    function parseTuple(buff) {
        const arity = buff.readUInt8(0);
        const term = tuple.create(arity);
        buff = buff.subarray(1);
        for (let i = 0; i < arity; i++) {
            const [element, nextBuff] = deserialize(buff, false);
            term.set(i, element);
            buff = nextBuff;
        }
        return [t(...term), buff];
    }
    function parseLargeTuple(buff) {
        const arity = buff.readUInt32BE(0);
        const term = tuple.create(arity);
        buff = buff.subarray(4);
        for (let i = 0; i < arity; i++) {
            const [element, nextBuff] = deserialize(buff, false);
            term.set(i, element);
            buff = nextBuff;
        }
        return [term, buff];
    }
    function parseMap(buff) {
        const arity = buff.readUInt32BE(0);
        const term = new Array(arity);
        buff = buff.subarray(4);
        for (let i = 0; i < arity; i++) {
            const [key, buff2] = deserialize(buff, false);
            const [value, buff3] = deserialize(buff2, false);
            term[i] = [key, value];
            buff = buff3;
        }
        return [term, buff];
    }
    function parseNil(buff) {
        return [list.nil, buff];
    }
    function parseString(buff) {
        const length = buff.readUInt16BE(0);
        return [l(...buff.subarray(2, 2 + length)), buff.subarray(2 + length)];
    }
    function parseBinary(buff) {
        const length = buff.readUInt32BE(0);
        let result = buff.subarray(4, 4 + length);
        if (options.binariesAsStrings) {
            result = result.toString('utf8');
        }
        return [result, buff.subarray(4 + length)];
    }
    function parseSmallBigNum(buff) {
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
    function parseLargeBigNum(buff) {
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
    function parseBetterFloat(buff) {
        const float = buff.readDoubleBE(0);
        return [float, buff.subarray(8)];
    }
    function parseUTF8Atom(buff) {
        const length = buff.readUInt16BE(0);
        const atom = buff.read(length, 2, 'utf8');
        return [atom, buff.subarray(2 + length)];
    }
    function parseSmallUTF8Atom(buff) {
        const buffer = Buffer.from('test', 'utf8');
        buffer;
        const length = buff.readUInt8(0);
        const atom = String(buff.subarray(1, 1 + length));
        return [Symbol.for(atom), buff.subarray(1 + length)];
    }
    function parseList(buff) {
        const length = buff.readUInt32BE(0);
        const list = new Array(length);
        buff = buff.subarray(4);

        for (let i = 0; i < length; i++) {
            const [element, nextBuff] = deserialize(buff, false);
            list[i] = element;
            buff = nextBuff;
        }

        const [tail, nextBuff] = deserialize(buff, false);
        list.tail = tail;
        return [il(...list, tail), nextBuff];
    }
}
