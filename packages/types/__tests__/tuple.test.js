/* eslint-env jest */
import { Tuple, t } from '../src';
import '@otpjs/test_utils';
import crypto from 'crypto';
import util from 'util';

const inspect = Symbol.for('nodejs.util.inspect.custom');

describe('Tuple', function () {
    describe('isTuple', function () {
        it('returns true if the object is a tuple', function () {
            expect(t.isTuple(t(1, 2, 3))).toBe(true);
        });
        it('returns false if the object is not a tuple', function () {
            expect(t.isTuple([])).toBe(false);
            expect(t.isTuple({})).toBe(false);
            expect(t.isTuple('')).toBe(false);
            expect(t.isTuple(0)).toBe(false);
            expect(t.isTuple(0n)).toBe(false);
            expect(t.isTuple(false)).toBe(false);
        });
    });
    it('accepts an arbitrary number of items', function () {
        const tuple1 = t(1, 2, 3);
        expect(tuple1.size).toBe(3);

        const tuple2 = t(...new Array(100));
        expect(tuple2.size).toBe(100);
    });

    it('is iterable', function () {
        const tuple = t(1, 2, 3);
        expect(tuple[Symbol.iterator]).not.toBe(undefined);
        expect(function () {
            for (const value of tuple) {
                expect(value).toEqual(expect.any(Number));
            }
        }).not.toThrow();
    });

    it('allows read access via get method', function () {
        const buffer = crypto.randomBytes(Math.floor(Math.random() * 128) + 1);
        const tuple1 = t(...buffer);

        for (let index = 0; index < buffer.length; index++) {
            const value = buffer.readUInt8(index);
            expect(tuple1.get(index)).toBe(value);
        }

        expect(() => tuple1.get(buffer.length + 1)).toThrow(RangeError);
    });

    it('allows read access via numeric index', function () {
        const buffer = crypto.randomBytes(Math.floor(Math.random() * 128) + 1);
        const tuple1 = t(...buffer);

        for (let index = 0; index < buffer.length; index++) {
            const value = buffer.readUInt8(index);
            expect(tuple1[index]).toBe(value);
        }

        expect(() => tuple1[buffer.length + 1]).toThrow(RangeError);
    });

    it('allows reading of defined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);

        expect(() => tuple1.get).not.toThrow();
        expect(() => tuple1.set).not.toThrow();
        expect(() => tuple1.size).not.toThrow();
        expect(() => tuple1.toJSON).not.toThrow();
        expect(() => tuple1[inspect]).not.toThrow();
        expect(() => tuple1[Symbol.iterator]).not.toThrow();
    });
    it('allows reading of undefined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);
        expect(tuple1.newProperty).toBe(undefined);
        expect(tuple1[Symbol()]).toBe(undefined);
    });

    it('does not allow writing to defined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);

        expect(() => (tuple1.get = undefined)).toThrow(RangeError);
        expect(() => (tuple1.set = undefined)).toThrow(RangeError);
        expect(() => (tuple1.size = undefined)).toThrow(RangeError);
        expect(() => (tuple1.toJSON = undefined)).toThrow(RangeError);
        expect(() => (tuple1[inspect] = undefined)).toThrow(RangeError);
        expect(() => (tuple1[Symbol.iterator] = undefined)).toThrow(RangeError);
    });
    it('does not allow writing to undefined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);
        expect(() => (tuple1.newProperty = null)).toThrow(RangeError);
        expect(() => (tuple1[Symbol()] = null)).toThrow(RangeError);
    });

    it('allows write access via set method', function () {
        const size = Math.floor(Math.random() * 128) + 1;
        const tuple1 = t(...String.fromCharCode(0).repeat(size));

        for (let index = 0; index < size; index++) {
            const value = Math.floor(Math.random() * 128);
            expect(tuple1.get(index)).toBe('\x00');
            expect(() => tuple1.set(index, value)).not.toThrow();
            expect(tuple1.get(index)).toBe(value);
        }

        expect(() => tuple1.set(size + 1, 'any value')).toThrow(RangeError);
    });

    it('allows write access via numeric index', function () {
        const size = Math.floor(Math.random() * 128) + 1;
        const tuple1 = t(...String.fromCharCode(0).repeat(size));

        for (let index = 0; index < size; index++) {
            const value = Math.floor(Math.random() * 128);
            expect(tuple1[index]).toBe('\x00');
            expect(() => (tuple1[index] = value)).not.toThrow();
            expect(tuple1[index]).toBe(value);
        }

        expect(() => (tuple1[size + 1] = 'any value')).toThrow(RangeError);
    });

    describe('inspection', function () {
        it('implements a custom inspect function', function () {
            const tuple = t(1, 2, 3);
            expect(tuple[inspect]).not.toBe(undefined);
            expect(tuple[inspect]).toBeInstanceOf(Function);
        });

        it('returns a string', function () {
            const tuple = t(1, 2, 3);
            expect(function () {
                util.inspect(tuple);
            }).not.toThrow();
        });

        it('returns a shortened form if depth is consumed', function () {
            expect(util.inspect(t(1, 2, 3), { depth: -1 })).toBe('[Tuple]');
        });

        it('returns a shortened form if size is greater than maxArrayLength', function () {
            expect(util.inspect(t(1, 2, 3), { maxArrayLength: 0 })).toBe(
                '{ ... 3 more items }'
            );
        });

        it('handles null depth', function () {
            expect(util.inspect(t(1, 2, 3), { depth: null })).toBe(
                '{ 1, 2, 3 }'
            );
        });
    });

    describe('toJSON', function () {
        it('encodes as an array with tag and array of items', function () {
            expect(t(1, 2, 3).toJSON()).toMatchPattern([
                '$otp.tuple',
                [1, 2, 3]
            ]);
        });
    });
});
