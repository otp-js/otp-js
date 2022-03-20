import { Pid, Ref, l, il, cons, t } from '../src';
import crypto from 'crypto';
import util from 'util';
import '@otpjs/test_utils';

jest.disableAutomock();

const inspect = Symbol.for('nodejs.util.inspect.custom');

describe('Pid', function () {
    it('cannot identify Pids from strings', function () {
        expect(Pid.isPid('Pid<0.0>')).toBe(false);
    });
    it('can identify Pids from Pids', function () {
        expect(Pid.isPid(Pid.of(0, 0))).toBe(true);
    });
});
describe('Ref', function () {
    it('cannot identify Refs from strings', function () {
        expect(Ref.isRef('Ref<0.0>')).toBe(false);
    });
    it('can identify Refs from Refs', function () {
        expect(Ref.isRef(Ref.for(0, 0))).toBe(true);
    });
});
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
            for (let value of tuple) {
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
                [1, 2, 3],
            ]);
        });
    });
});

describe('List', function () {
    it('can be nil', function () {
        const value = l();
        expect(value).toBe(l.nil);
    });
    it('has a length', function () {
        let list1 = l();
        let list2 = l(1, 2, 3);

        expect(list1.length()).toBe(0);
        expect(list2.length()).toBe(3);
    });
    it('can add to the end', function () {
        let list = l(1, 2, 3);
        expect(list.push(4)).toMatchPattern(l(1, 2, 3, 4));
        expect(l.nil.push(0)).toMatchPattern(l(0));
    });
    it('cannot add to the end of an improper list', function () {
        expect(() => il(1, 2, null).push(3)).toThrow('pushed to improper list');
    });
    it('can add to the head with cons', function () {
        let list = l(1, 2, 3);
        expect(cons(0, list)).toMatchPattern(l(0, 1, 2, 3));
    });
    describe('replaceWhere', function () {
        it('substitutes the first value for which the predicate is true', function () {
            expect(l(1, 2, 3).replaceWhere((n) => n == 2, 4)).toMatchPattern(
                l(1, 4, 3)
            );
        });
        it('optionally inserts the value at the end of the list if the predicate is never true', function () {
            expect(
                l(1, 2, 3).replaceWhere((n) => n === 4, 5, true)
            ).toMatchPattern(l(1, 2, 3, 5));
            expect(
                l(1, 2, 3).replaceWhere((n) => n === 4, 5, false)
            ).toMatchPattern(l(1, 2, 3));
        });
    });
    describe('includes', function () {
        it('scans the list for value, returning true if found, false if not', function () {
            const list = l(1, 2, 3);
            const improper = il(1, 2, 3);
            expect(list.includes(2)).toBe(true);
            expect(list.includes(4)).toBe(false);
            expect(improper.includes(2)).toBe(true);
            expect(improper.includes(4)).toBe(false);
        });
    });
    describe('find', function () {
        it('finds and returns the first value for which predicate is true', function () {
            const list = l(1, 2, 3);
            const improper = il(1, 2, 3);
            expect(list.find((value) => value === 2)).toBe(2);
            expect(list.find((value) => value === 4)).toBe(undefined);
            expect(improper.find((value) => value === 2)).toBe(2);
            expect(improper.find((value) => value === 4)).toBe();
        });
    });
    describe('slice', function () {
        it('returns a copy of the list when no indexes are specified', function () {
            const list = l(1, 2, 3);
            const copy = list.slice();

            expect(copy).toMatchPattern(list);
            expect(copy).not.toBe(list);
        });
        it('retuns the list of items from the starting index', function () {
            const list = l(1, 2, 3, 4, 5);
            const sliced = list.slice(2);

            expect(sliced).toMatchPattern(l(3, 4, 5));
        });
        it('returns the list of items up to the ending index', function () {
            const list = l(1, 2, 3, 4, 5);
            const sliced = list.slice(0, 2);

            expect(sliced).toMatchPattern(l(1, 2));
        });
        it('returns the list of items from the starting index up to the ending index', function () {
            const list = l(1, 2, 3, 4, 5);
            const sliced = list.slice(1, 4);

            expect(sliced).toMatchPattern(l(2, 3, 4));
        });
        it('returns the list of items from the starting index up to length minus the ending index', function () {
            const list = l(1, 2, 3, 4, 5);
            const sliced = list.slice(1, -2);

            expect(sliced).toMatchPattern(l(2, 3));
        });
    });
    describe('delete', function () {
        it('removes the first element which is strictly equal to the argument', function () {
            expect(l(1, 2, 3).delete(1)).toMatchPattern(l(2, 3));
            expect(l(1, 2, 3).delete(2)).toMatchPattern(l(1, 3));
            expect(l(1, 2, 3).delete(3)).toMatchPattern(l(1, 2));
        });
    });
    describe('deleteIndex', function () {
        it('removes the Nth item of the list', function () {
            expect(l(1, 2, 3).deleteIndex(1)).toMatchPattern(l(1, 3));
            expect(l(1, 2, 3).deleteIndex(3)).toMatchPattern(l(1, 2, 3));
        });
    });
    describe('nth', function () {
        it('returns the Nth item of the list', function () {
            const list = l(1, 2, 3, 4, 5);
            expect(list.nth(0)).toBe(1);
            expect(list.nth(1)).toBe(2);
            expect(list.nth(2)).toBe(3);
            expect(list.nth(3)).toBe(4);
            expect(list.nth(4)).toBe(5);
            expect(list.nth(5)).toBe(undefined);
        });
    });
    describe('ImproperList', function () {
        it('is a list node which has a non-list tail', function () {
            const node = il(1, 2);
            expect(l.isList(node)).toBe(true);
            expect(l.isList(node.tail)).toBe(false);
        });
        it('can be constructed with cons', function () {
            const node = cons(1, 2);
            expect(l.isList(node)).toBe(true);
            expect(l.isList(node.tail)).toBe(false);
        });
        it('cannot be constructed without a tail', function () {
            const valid = il(1);
            const invalid = il();
            expect(l.isList(valid)).toBe(true);
            expect(l.isList(valid.tail)).toBe(false);
            expect(l.isList(invalid)).toBe(false);
            expect(invalid).toBe(undefined);
        });
        it('includes an isList function', function () {
            const improper = il(1, 2);
            expect(il.isList).toBeInstanceOf(Function);
            expect(il.isList(improper)).toBe(true);
            expect(il.isList(improper.tail)).toBe(false);
            expect(il.isList(undefined)).toBe(false);
        });
    });
    describe('inspection', function () {
        it('implements a custom inspect function', function () {
            const list = l(1, 2, 3);
            expect(list[inspect]).not.toBe(undefined);
            expect(list[inspect]).toBeInstanceOf(Function);
        });

        it('returns a string', function () {
            const list = l(1, 2, 3);
            expect(util.inspect(list)).toEqual(expect.any(String));
        });

        it('returns a shortened form if depth is consumed', function () {
            expect(util.inspect(l(1, 2, 3), { depth: -1 })).toBe('[List]');
        });

        it('returns a shortened form if size is greater than maxArrayLength', function () {
            expect(util.inspect(l(1, 2, 3), { maxArrayLength: 0 })).toBe(
                '[ ... 3 more items ]'
            );
            expect(util.inspect(l(1, 2, 3), { maxArrayLength: 2 })).toBe(
                '[ 1, 2 ... 1 more items ]'
            );
            expect(util.inspect(il(1, 2, 3), { maxArrayLength: 2 })).toBe(
                '[ 1, 2 | 3 ]'
            );
        });

        it('handles null depth', function () {
            expect(util.inspect(l(1, 2, 3), { depth: null })).toBe(
                '[ 1, 2, 3 ]'
            );
        });
    });
    it('can be reversed', function () {
        let list = l(1, 2, 3);
        expect(list.reverse()).toMatchPattern(l(3, 2, 1));
    });
    it('accepts an arbitrary number of items', function () {
        const list1 = l(1, 2, 3);
        expect(list1.length()).toBe(3);

        const list2 = l(...new Array(100));
        expect(list2.length()).toBe(100);
    });
    it('can be iterated over', function () {
        const list = l(1, 2, 3);
        expect(function () {
            let index = 0;
            for (let item of list) {
                expect(item).toBe(list.nth(index++));
            }
        }).not.toThrow();
    });
});
