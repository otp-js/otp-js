import './extend';
import { _, spread } from '../src/symbols';
import { match, compile } from '../src/matching';

describe('@otpjs/core/matching/compile', function () {
    it('understands _ to match everything', function () {
        let compiled = compile(_);
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
            ['symbol', Symbol()],
        ];
        tests.map(([type, value]) => {
            it(`strictly compares ${type}`, function () {
                let compiled = null;
                expect(() => (compiled = compile(value))).not.toThrow();
                expect(compiled).toBeInstanceOf(Function);
                tests.forEach(([otherType, value]) => {
                    let expectedResult = otherType === type;
                    expect(compiled(value)).toBe(expectedResult);
                });
            });
        });
    });
    describe('with complex types', function () {
        describe('such as arrays', function () {
            it('compares child elements', function () {
                const compiled = compile([1, 2, 3]);
                expect(compiled([1, 2, 3])).toBe(true);
                expect(compiled([3, 2, 1])).toBe(false);
            });
            it('does not allow fewer than the number of specified elements', function () {
                const compiled = compile([_, _, _]);
                const message = [1, 2];
                expect(compiled(message)).toBe(false);
            });
            it('matches equal number of elements exactly', function () {
                const compiled = compile([_, _, _]);
                const message = [1, 2, 3];
                expect(compiled(message)).toBe(true);
            });
            describe('with no spread symbol', function () {
                it('does not allow extra elements', function () {
                    const compiled = compile([_, _, _]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).toBe(false);
                });
            });
            describe('with a spread symbol', function () {
                it('expects the spread to be the second to last element or last element', function () {
                    expect(() => compile([_, _, spread, _, _])).toThrow(
                        'invalid_match_pattern'
                    );
                    expect(() => compile([_, _, spread, _])).not.toThrow(
                        'invalid_match_pattern'
                    );
                    expect(() => compile([_, _, spread])).not.toThrow(
                        'invalid_match_pattern'
                    );
                });
                it('does allow extra elements', function () {
                    const compiled = compile([_, _, spread]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).toBe(true);
                });
                it('still requires specified elements', function () {
                    const compiled = compile([_, _, spread]);
                    const message = [1];
                    expect(compiled(message)).toBe(false);
                });
            });
        });
        describe('such as objects', function () {
            it('compares child elements', function () {
                const compiled = compile({ a: 1, b: _, c: 3 });
                expect(compiled({ a: 1, b: 2, c: 3 })).toBe(true);
                expect(compiled({ c: 2, b: 1, a: 3 })).toBe(false);
                expect(compiled({ a: 1, b: 0, c: 3 })).toBe(true);
            });
            describe('without a spread operator', function () {
                it('does not allow extra keys', function () {
                    const compiled = compile({ a: 1, b: _ });
                    expect(compiled({ a: 1, b: 2 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 3 })).toBe(false);
                });
            });
            describe('with a spread operator', function () {
                it('allows extra keys that match its pattern', function () {
                    const compiled = compile({ a: 1, b: 2, [spread]: 3 });
                    expect(compiled({ a: 1, b: 2, c: 3 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 4 })).toBe(false);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 3 })).toBe(true);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 4 })).toBe(false);
                });
            });
        });
        describe('such as functions', function () {
            it('passes them through as comparators', function () {
                const compiled = compile(function (message) {
                    return typeof message === 'number';
                });
                expect(compiled(1)).toBe(true);
                expect(compiled(2)).toBe(true);
                expect(compiled('3')).toBe(false);
                expect(compiled(BigInt(4))).toBe(false);
                expect(compiled(true)).toBe(false);
                expect(compiled(Symbol())).toBe(false);
                expect(compiled(undefined)).toBe(false);
                expect(compiled([])).toBe(false);
                expect(compiled({})).toBe(false);
            });
        });
    });
});

describe('@otpjs/core/matching/match', function () {});
