/* eslint-env jest */
import { Tuple, List, l, il, cons, car, cdr } from '../src';
import '@otpjs/test_utils';
import crypto from 'crypto';
import util from 'util';
import debug from 'debug';

const log = debug('otpjs:types:list:__tests__');

const inspect = Symbol.for('nodejs.util.inspect.custom');

describe('List', function () {
    it('can be nil', function () {
        const value = l();
        expect(value).toBe(l.nil);
    });
    it('has a length', function () {
        const list1 = l();
        const list2 = l(1, 2, 3);

        expect(list1.length()).toBe(0);
        expect(list2.length()).toBe(3);
    });
    it('can add to the end', function () {
        const list = l(1, 2, 3);
        expect(list.push(4)).toMatchPattern(l(1, 2, 3, 4));
        expect(l.nil.push(0)).toMatchPattern(l(0));
    });
    it('cannot add to the end of an improper list', function () {
        expect(() => il(1, 2, null).push(3)).toThrow('pushed to improper list');
    });
    it('can add to the head with cons', function () {
        const list = l(1, 2, 3);
        expect(cons(0, list)).toMatchPattern(l(0, 1, 2, 3));
    });
    describe('isEmpty', function () {
        describe('given nil', function () {
            it('returns true', function () {
                expect(l.isEmpty(l.nil)).toBe(true);
                expect(il.isEmpty(l.nil)).toBe(true);
                expect(List.isEmpty(l.nil)).toBe(true);
            });
        });
        describe('given a non-nil list', function () {
            it('returns false', function () {
                expect(l.isEmpty(l(1, 2, 3))).toBe(false);
                expect(il.isEmpty(il(1, 2, 3))).toBe(false);
                expect(List.isEmpty(l(1, 2, 3))).toBe(false);
            });
        });
    });
    describe('replaceWhere', function () {
        it('substitutes the first value for which the predicate is true', function () {
            expect(l(1, 2, 3).replaceWhere((n) => n === 2, 4)).toMatchPattern(
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
    describe('deleteWhere', function () {
        it('deletes the first value for which the predicate is true', function () {
            expect(l(1, 2, 3).deleteWhere((n) => n === 2)).toMatchPattern(
                l(1, 3)
            );
        });
        it('does not modify the list if the predicate is never true', function () {
            expect(l(1, 2, 3).deleteWhere((n) => n === 4)).toMatchPattern(l(1, 2, 3));
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
    describe('append', function () {
        describe('given  another list', function () {
            it('appends it to this list', function () {
                const list = l(1, 2, 3);
                expect(list.append(l(4, 5, 6))).toMatchPattern(l(1, 2, 3, 4, 5, 6));
            });
        });
        describe('given a non-list', function () {
            it('creates an improper list with the value as the deepest tail', function () {
                const list = l(1, 2, 3);
                expect(list.append(4)).toMatchPattern(il(1, 2, 3, 4));
            });
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
    describe('toString', function () {
        it('returns a string', function () {
            expect(l(1, 2, 3).toString()).toBe('[ 1, 2, 3 ]');
            expect(il(1, 2, 3).toString()).toBe('[ 1, 2 | 3 ]');
            expect(l.nil.toString()).toBe('[ ]');
        });

        describe('with an object child containing a toString method', function () {
            it('calls the toString method on the object', function () {
                const toString = jest.fn(() => 'object');
                const object = { toString };
                const list = l(1, 2, object);
                expect(list.toString()).toBe('[ 1, 2, object ]');
            });
        });

        describe('with a symbol child', function () {
            describe('which is a known symbol', function () {
                it('converts the symbol to its key', function () {
                    const symbol = Symbol.for('well_known');
                    const list = l(1, 2, symbol);
                    expect(list.toString()).toBe('[ 1, 2, Symbol(well_known) ]');
                });
            });
            describe('which is a named symbol', function () {
                it('converts it to a string representation', function () {
                    const symbol = Symbol('anonymous');
                    const list = l(1, 2, symbol);
                    expect(list.toString()).toBe('[ 1, 2, Symbol(anonymous) ]');
                });
            });
            describe('which is an anonymous symbol', function () {
                it('converts it to a string representation', function () {
                    const symbol = Symbol();
                    const list = l(1, 2, symbol);
                    expect(list.toString()).toBe('[ 1, 2, Symbol() ]');
                });
            });
        });
    });
    describe('toStringTag', function () {
        describe('when coerced to a string', function () {
            it('returns the name of the object', function () {
                const list = l(1, 2, 3);
                expect(Object.prototype.toString.call(list)).toBe('[object List]');
            });
        });
    });
    it('can be reversed', function () {
        const list = l(1, 2, 3);
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
            for (const item of list) {
                expect(item).toBe(list.nth(index++));
            }
        }).not.toThrow();
    });
    describe('map', function () {
        it('handles nil', function () {
            const fn = jest.fn();
            expect(l.nil).toHaveProperty('map');
            expect(function () {
                l.nil.map(fn);
            }).not.toThrow();
        });
        it('returns a promise', function () {
            expect(l.nil.map()).toBeInstanceOf(Promise);
        });
        it('runs the given function over every element of the list', async function () {
            const elements = crypto.randomBytes(8);
            const list = l(...elements);
            const fn = jest.fn();

            await expect(list.map(fn)).resolves.not.toBeFalsy();
            expect(fn).toHaveBeenCalledTimes(elements.length);

            for (let index = 0; index < elements.length; index++) {
                expect(fn.mock.calls[index][0]).toBe(elements[index]);
            }
        });
        it('creates a new list of the return values for each run', async function () {
            const transform = (value) => value * 4;
            const elements = Array.from(crypto.randomBytes(8));
            const nextElements = elements.map(transform);
            const list = l(...elements);
            const fn = jest.fn(transform);

            const promise = list.map(fn);
            await expect(promise).resolves.not.toBeFalsy();
            expect(fn).toHaveBeenCalledTimes(elements.length);

            let it = await promise;
            log(
                'map(it: %o, elements: %o, nextElements: %o)',
                it,
                elements,
                nextElements
            );
            for (let index = 0; index < elements.length; index++) {
                expect(fn.mock.calls[index][0]).toBe(elements[index]);
                expect(fn.mock.results[index].value).toBe(nextElements[index]);

                const head = car(it);
                expect(head).toBe(nextElements[index]);
                it = cdr(it);
            }
        });
    });
    describe('filter', function () {
        it('handles nil', function () {
            const fn = jest.fn();
            expect(l.nil).toHaveProperty('map');
            expect(function () {
                l.nil.map(fn);
            }).not.toThrow();
        });
        it('returns a promise', function () {
            expect(l.nil.map()).toBeInstanceOf(Promise);
        });
        it('creates a list of elements for which the function returned true', async function () {
            const filter = (value) => value > 3;
            const elements = [0, 7, 1, 6, 2, 5, 3, 4];
            const results = elements.map(filter);
            const list = l(...elements);
            const fn = jest.fn(filter);

            const promise = list.filter(fn);
            await expect(promise).resolves.not.toBeFalsy();
            expect(fn).toHaveBeenCalledTimes(elements.length);

            let it = await promise;
            log(
                'map(it: %o, elements: %o, results: %o)',
                it,
                elements,
                results
            );

            for (let index = 0; index < elements.length; index++) {
                expect(fn.mock.calls[index][0]).toBe(elements[index]);
                expect(fn.mock.results[index].value).toBe(results[index]);

                if (results[index]) {
                    const head = car(it);
                    expect(head).toBe(elements[index]);
                    it = cdr(it);
                }
            }
        });
    });
    describe('split', function () {
        describe('on nil', function () {
            it('does not throw', function () {
                expect(function () {
                    l.nil.split();
                }).not.toThrow();
            });
            it('returns a tuple with two nils', function () {
                const result = l.nil.split(() => true);
                expect(result).toBeInstanceOf(Tuple);
                expect(result[0]).toBe(l.nil);
                expect(result[1]).toBe(l.nil);
            });
            it('splits the list at the point where the predicate returns true', function () {
                const expectedA = [0, 1, 2, 3];
                const expectedB = [4, 5, 6, 7];
                const result = l(0, 1, 2, 3, 4, 5, 6, 7).split(
                    (value) => value === 4
                );
                expect(result).toBeInstanceOf(Tuple);

                const [listA, listB] = result;
                let itA = listA;
                let itB = listB;

                for (let index = 0; index < expectedA.length; index++) {
                    const headA = car(itA);
                    const headB = car(itB);

                    expect(headA).toBe(expectedA[index]);
                    expect(headB).toBe(expectedB[index]);

                    itA = cdr(itA);
                    itB = cdr(itB);
                }
            });
        });
    });
});
