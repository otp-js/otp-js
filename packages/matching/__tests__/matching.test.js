/* eslint-env jest */
import './extend';
import { _, spread } from '../src/symbols';
import * as match from '../src';
import { l, il, Pid, Ref } from '@otpjs/types';

describe('@otpjs/matching/core/compile', function () {
    it('understands _ to match everything', function () {
        const compiled = match.compile(_);
        expect(compiled(1)).toBe(true);
        expect(compiled(2)).toBe(true);
        expect(compiled(3.0)).toBe(true);
        expect(compiled('4')).toBe(true);
        expect(compiled([])).toBe(true);
        expect(compiled({})).toBe(true);
    });
    describe('with simple types', function () {
        const tests = [
            ['number', 1],
            ['string', '3'],
            ['boolean', false],
            ['undefined', undefined],
            ['bigint', BigInt(10000)],
            ['symbol', Symbol('test_symbol')],
            ['object', null]
        ];
        tests.forEach(([type, value]) => {
            it(`strictly compares ${type}`, function () {
                let compiled = null;
                expect(() => (compiled = match.compile(value))).not.toThrow();
                expect(compiled).toBeInstanceOf(Function);
                tests.forEach(([otherType, value]) => {
                    const expectedResult = otherType === type;
                    expect(compiled(value)).toBe(expectedResult);
                });
            });
        });
    });
    describe('with complex types', function () {
        describe('such as arrays', function () {
            it('compares child elements', function () {
                const compiled = match.compile([1, 2, 3]);
                expect(compiled([1, 2, 3])).toBe(true);
                expect(compiled([3, 2, 1])).toBe(false);
            });
            it('does not allow fewer than the number of specified elements', function () {
                const compiled = match.compile([_, _, _]);
                const message = [1, 2];
                expect(compiled(message)).toBe(false);
            });
            it('matches equal number of elements exactly', function () {
                const compiled = match.compile([_, _, _]);
                const message = [1, 2, 3];
                expect(compiled(message)).toBe(true);
            });
            describe('with no spread symbol', function () {
                it('does not allow extra elements', function () {
                    const compiled = match.compile([_, _, _]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).toBe(false);
                });
            });
            describe('with a spread symbol', function () {
                it('expects the spread to be the second to last element or last element', function () {
                    expect(() => match.compile([_, _, spread, _, _])).toThrow(
                        'invalid_match_pattern'
                    );
                    expect(() => match.compile([_, _, spread, _])).not.toThrow(
                        'invalid_match_pattern'
                    );
                    expect(() => match.compile([_, _, spread])).not.toThrow(
                        'invalid_match_pattern'
                    );
                });
                it('does allow extra elements', function () {
                    const compiled = match.compile([_, _, spread]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).toBe(true);
                });
                it('still requires specified elements', function () {
                    const compiled = match.compile([_, _, spread]);
                    const message = [1];
                    expect(compiled(message)).toBe(false);
                });
            });
        });
        describe('such as lists', function () {
            it('compares child elements', function () {
                const compiled = match.compile(l(1, 2, 3));
                expect(compiled(l(1, 2, 3))).toBe(true);
                expect(compiled(l(3, 2, 1))).toBe(false);
            });
            it('does not allow fewer than the number of specified elements', function () {
                const compiled = match.compile(l(_, _, _));
                const message = l(1, 2);
                expect(compiled(message)).toBe(false);
            });
            it('matches equal number of elements exactly', function () {
                const compiled = match.compile(l(_, _, _));
                const message = l(1, 2, 3);
                expect(compiled(message)).toBe(true);
            });
            it('matches invalid tails', function () {
                const compiled = match.compile(il(1, 2, 3));
                const improper = il(1, 2, 3);
                const proper = l(1, 2, 3);
                expect(compiled(improper)).toBe(true);
                expect(compiled(proper)).toBe(false);
            });
        });
        describe('such as objects', function () {
            it('compares child elements', function () {
                const compiled = match.compile({ a: 1, b: _, c: 3 });
                expect(compiled({ a: 1, b: 2, c: 3 })).toBe(true);
                expect(compiled({ c: 2, b: 1, a: 3 })).toBe(false);
                expect(compiled({ a: 1, b: 0, c: 3 })).toBe(true);
            });
            describe('without a spread operator', function () {
                it('does not allow extra keys', function () {
                    const compiled = match.compile({ a: 1, b: _ });
                    expect(compiled({ a: 1, b: 2 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 3 })).toBe(false);
                });
            });
            describe('with a spread operator', function () {
                it('allows extra keys that match its pattern', function () {
                    const compiled = match.compile({ a: 1, b: 2, [spread]: 3 });
                    expect(compiled({ a: 1, b: 2, c: 3 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 4 })).toBe(false);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 3 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 4 })).toBe(false);
                });
            });
            describe('with an embedded function', function () {
                it('is assumed to be a guard', function () {
                    const testFunction = jest.fn();
                    const testObject = { property: testFunction };
                    const compiled = match.compile(testObject);

                    expect(compiled({})).toBe(false);
                    expect(testFunction).not.toHaveBeenCalled();

                    testFunction.mockReturnValue(true);
                    expect(compiled({ property: 'any' })).toBe(true);

                    testFunction.mockReturnValue(false);
                    expect(compiled({ property: 'any' })).toBe(false);
                });
            });
        });
        describe('such as regular expressions', function () {
            const compiled = match.compile(/^test_regex$/);
            it('matches compatible strings', function () {
                expect(compiled('test_regex')).toBe(true);
                expect(compiled('test_regex_2')).toBe(false);
            });
        });
        describe('such as functions', function () {
            it('passes them through as comparators', function () {
                const compiled = match.compile(function (message) {
                    return typeof message === 'number';
                });
                expect(compiled(1)).toBe(true);
                expect(compiled(2)).toBe(true);
                expect(compiled('3')).toBe(false);
                expect(compiled(BigInt(4))).toBe(false);
                expect(compiled(true)).toBe(false);
                expect(compiled(Symbol('test_symbol'))).toBe(false);
                expect(compiled(undefined)).toBe(false);
                expect(compiled(null)).toBe(false);
                expect(compiled([])).toBe(false);
                expect(compiled({})).toBe(false);
            });
        });
        describe('such as OTP types', function () {
            describe('like Pids', function () {
                it('compares Pids for equality', function () {
                    const pidA = Pid.of(0, 0, 0, 0);
                    const pidB = Pid.of(1, 0, 0, 0);
                    const pidC = Pid.of(0, 1, 0, 0);
                    const pidD = Pid.of(0, 0, 1, 0);
                    const pidE = Pid.of(0, 0, 0, 1);

                    const comparePid = Pid.of(0, 0, 0, 0);
                    const test = match.compile(comparePid);

                    expect(test(comparePid)).toBe(true);
                    expect(test(pidA)).toBe(true);

                    expect(test(pidB)).toBe(false);
                    expect(test(pidC)).toBe(false);
                    expect(test(pidD)).toBe(false);
                    expect(test(pidE)).toBe(false);
                });
            });
            describe('like Refs', function () {
                it('compares Refs for equality', function () {
                    const refA = Ref.for(0, 0, 0, 0);
                    const refB = Ref.for(1, 0, 0, 0);
                    const refC = Ref.for(0, 1, 0, 0);
                    const refD = Ref.for(0, 0, 1, 0);
                    const refE = Ref.for(0, 0, 0, 1);

                    const compareRef = Ref.for(0, 0, 0, 0);
                    const test = match.compile(compareRef);

                    expect(test(compareRef)).toBe(true);
                    expect(test(refA)).toBe(true);

                    expect(test(refB)).toBe(false);
                    expect(test(refC)).toBe(false);
                    expect(test(refD)).toBe(false);
                    expect(test(refE)).toBe(false);
                });
            });
        });
    });
});
describe('@otpjs/matching/core/compare', function () {
    describe('given two terms', function () {
        it('treats the first term as a pattern', function () {
            expect(match.compare(/^test_regex$/, 'test_regex')).toBe(true);
            expect(match.compare(/^test_regex$/, 'test_regexes')).toBe(false);
            expect(match.compare(_, Infinity)).toBe(true);
            expect(match.compare(Number.isFinite, Infinity)).toBe(false);
            expect(match.compare({ a: 1, [spread]: _ }, { a: 1, b: 2, c: '3' })).toBe(
                true
            );
            expect(
                match.compare({ a: 1, [spread]: Number.isInteger }, {
                    a: 1,
                    b: 2,
                    c: '3'
                })
            ).toBe(false);
        });
    });
});
describe('@otpjs/matching/core/match', function () {
    it('returns a function', function () {
        expect(match.match()).toBeInstanceOf(Function);
    });
    describe('given a collection of patterns', function () {
        let patternA;
        let patternB;
        let patternC;
        let checkValue;

        beforeEach(function () {
            patternA = jest.fn(Number.isInteger);
            patternB = jest.fn(Array.isArray);
            patternC = jest.fn(Number.isFinite);
            checkValue = [patternA, patternB, patternC];
        });

        describe('the returned function', function () {
            it('returns true if any of the patterns match', function () {
                const matcher = match.match(...checkValue);
                expect(matcher(1)).toBe(true);
                expect(matcher(3.14)).toBe(true);
                expect(matcher(Number.MAX_SAFE_INTEGER)).toBe(true);
                expect(matcher([])).toBe(true);
                expect(matcher({})).toBe(false);
                expect(matcher('1')).toBe(false);
                expect(matcher(Infinity)).toBe(false);
            });
        });
    });
});
describe('@otpjs/matching/core/oneOf', function () {
    it('matches any supplied pattern', function () {
        const patternA = Number.isInteger;
        const patternB = Array.isArray;
        expect(match.oneOf).toBeInstanceOf(Function);
        expect(function () {
            match.oneOf(patternA, patternB);
        }).not.toThrow();
        expect(match.oneOf(patternA, patternB)).toBeInstanceOf(Function);

        const test = match.oneOf(patternA, patternB);
        expect(test(1)).toBe(true);
        expect(test([])).toBe(true);
        expect(test({})).toBe(false);
        expect(test('1')).toBe(false);
    });
});
describe('@otpjs/matching/core/caseOf', function () {
    describe('when given a value', function () {
        it('returns a function', function () {
            const value = 123;
            expect(match.caseOf(value)).toBeInstanceOf(Function);
        });

        describe('the returned function', function () {
            describe('given a pattern', function () {
                it('returns true if the value matches the pattern', function () {
                    const valueA = 123;
                    const valueB = '456';

                    const caseA = match.caseOf(valueA);
                    const caseB = match.caseOf(valueB);

                    expect(caseA(valueA)).toBe(true);
                    expect(caseA(Number.isInteger)).toBe(true);
                });
            });
        });
    });
});
