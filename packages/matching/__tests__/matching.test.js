/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import patternMatching from '#chai';
import { _, spread } from '#symbols';
import * as match from '../lib/index.js';
import { l, il, Pid, Ref } from '@otpjs/types';

chai.use(patternMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;


describe('@otpjs/matching/core/compile', function() {
    it('understands _ to match everything', function() {
        const compiled = match.compile(_);
        expect(compiled(1)).to.equal(true);
        expect(compiled(2)).to.equal(true);
        expect(compiled(3.0)).to.equal(true);
        expect(compiled('4')).to.equal(true);
        expect(compiled([])).to.equal(true);
        expect(compiled({})).to.equal(true);
    });
    describe('with simple types', function() {
        const tests = [
            ['number', 1],
            ['string', '3'],
            ['boolean', false],
            ['undefined', undefined],
            ['bigint', BigInt(10000)],
            ['symbol', Symbol('test_symbol')],
            ['object', null],
        ];
        tests.forEach(([type, value]) => {
            it(`strictly compares ${type}`, function() {
                let compiled = null;
                expect(() => (compiled = match.compile(value))).not.to.throw();
                expect(compiled).to.be.an.instanceOf(Function);
                tests.forEach(([otherType, value]) => {
                    const expectedResult = otherType === type;
                    expect(compiled(value)).to.equal(expectedResult);
                });
            });
        });
    });
    describe('with complex types', function() {
        describe('such as arrays', function() {
            it('compares child elements', function() {
                const compiled = match.compile([1, 2, 3]);
                expect(compiled([1, 2, 3])).to.equal(true);
                expect(compiled([3, 2, 1])).to.equal(false);
            });
            it('does not allow fewer than the number of specified elements', function() {
                const compiled = match.compile([_, _, _]);
                const message = [1, 2];
                expect(compiled(message)).to.equal(false);
            });
            it('matches equal number of elements exactly', function() {
                const compiled = match.compile([_, _, _]);
                const message = [1, 2, 3];
                expect(compiled(message)).to.equal(true);
            });
            describe('with no spread symbol', function() {
                it('does not allow extra elements', function() {
                    const compiled = match.compile([_, _, _]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).to.equal(false);
                });
            });
            describe('with a spread symbol', function() {
                it('expects the spread to be the second to last element or last element', function() {
                    expect(() => match.compile([_, _, spread, _, _])).to.throw(
                        'invalid_match_pattern'
                    );
                    expect(() => match.compile([_, _, spread, _])).not.to.throw(
                        'invalid_match_pattern'
                    );
                    expect(() => match.compile([_, _, spread])).not.to.throw(
                        'invalid_match_pattern'
                    );
                });
                it('does allow extra elements', function() {
                    const compiled = match.compile([_, _, spread]);
                    const message = [1, 2, 3, 4];
                    expect(compiled(message)).to.equal(true);
                });
                it('still requires specified elements', function() {
                    const compiled = match.compile([_, _, spread]);
                    const message = [1];
                    expect(compiled(message)).to.equal(false);
                });
            });
        });
        describe('such as lists', function() {
            it('compares child elements', function() {
                const compiled = match.compile(l(1, 2, 3));
                expect(compiled(l(1, 2, 3))).to.equal(true);
                expect(compiled(l(3, 2, 1))).to.equal(false);
            });
            it('does not allow fewer than the number of specified elements', function() {
                const compiled = match.compile(l(_, _, _));
                const message = l(1, 2);
                expect(compiled(message)).to.equal(false);
            });
            it('matches equal number of elements exactly', function() {
                const compiled = match.compile(l(_, _, _));
                const message = l(1, 2, 3);
                expect(compiled(message)).to.equal(true);
            });
            it('matches invalid tails', function() {
                const compiled = match.compile(il(1, 2, 3));
                const improper = il(1, 2, 3);
                const proper = l(1, 2, 3);
                expect(compiled(improper)).to.equal(true);
                expect(compiled(proper)).to.equal(false);
            });
        });
        describe('such as objects', function() {
            it('compares child elements', function() {
                const compiled = match.compile({ a: 1, b: _, c: 3 });
                expect(compiled({ a: 1, b: 2, c: 3 })).to.equal(true);
                expect(compiled({ c: 2, b: 1, a: 3 })).to.equal(false);
                expect(compiled({ a: 1, b: 0, c: 3 })).to.equal(true);
            });
            describe('without a spread operator', function() {
                it('does not allow extra keys', function() {
                    const compiled = match.compile({ a: 1, b: _ });
                    expect(compiled({ a: 1, b: 2 })).to.equal(true);
                    expect(compiled({ a: 1, b: 2, c: 3 })).to.equal(false);
                });
            });
            describe('with a spread operator', function() {
                it('allows extra keys that match its pattern', function() {
                    const compiled = match.compile({ a: 1, b: 2, [spread]: 3 });
                    expect(compiled({ a: 1, b: 2, c: 3 })).to.equal(true);
                    expect(compiled({ a: 1, b: 2, c: 4 })).to.equal(false);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 3 })).to.equal(true);
                    expect(compiled({ a: 1, b: 2, c: 3, d: 4 })).to.equal(false);
                });
            });
            describe('with an embedded function', function() {
                it('is assumed to be a guard', function() {
                    const testFunction = sinon.stub();
                    const testObject = { property: testFunction };
                    const compiled = match.compile(testObject);

                    expect(compiled({})).to.equal(false);
                    expect(testFunction).not.to.have.been.called;

                    testFunction.returns(true);
                    expect(compiled({ property: 'any' })).to.equal(true);

                    testFunction.returns(false);
                    expect(compiled({ property: 'any' })).to.equal(false);
                });
            });
        });
        describe('such as regular expressions', function() {
            const compiled = match.compile(/^test_regex$/);
            it('matches compatible strings', function() {
                expect(compiled('test_regex')).to.equal(true);
                expect(compiled('test_regex_2')).to.equal(false);
            });
        });
        describe('such as functions', function() {
            it('passes them through as comparators', function() {
                const compiled = match.compile(function(message) {
                    return typeof message === 'number';
                });
                expect(compiled(1)).to.equal(true);
                expect(compiled(2)).to.equal(true);
                expect(compiled('3')).to.equal(false);
                expect(compiled(BigInt(4))).to.equal(false);
                expect(compiled(true)).to.equal(false);
                expect(compiled(Symbol('test_symbol'))).to.equal(false);
                expect(compiled(undefined)).to.equal(false);
                expect(compiled(null)).to.equal(false);
                expect(compiled([])).to.equal(false);
                expect(compiled({})).to.equal(false);
            });
        });
        describe('such as OTP types', function() {
            describe('like Pids', function() {
                it('compares Pids for equality', function() {
                    const pidA = Pid.of(0, 0, 0, 0);
                    const pidB = Pid.of(1, 0, 0, 0);
                    const pidC = Pid.of(0, 1, 0, 0);
                    const pidD = Pid.of(0, 0, 1, 0);
                    const pidE = Pid.of(0, 0, 0, 1);

                    const comparePid = Pid.of(0, 0, 0, 0);
                    const test = match.compile(comparePid);

                    expect(test(comparePid)).to.equal(true);
                    expect(test(pidA)).to.equal(true);

                    expect(test(pidB)).to.equal(false);
                    expect(test(pidC)).to.equal(false);
                    expect(test(pidD)).to.equal(false);
                    expect(test(pidE)).to.equal(false);
                });
            });
            describe('like Refs', function() {
                it('compares Refs for equality', function() {
                    const refA = Ref.for(0, 0, 0, 0);
                    const refB = Ref.for(1, 0, 0, 0);
                    const refC = Ref.for(0, 1, 0, 0);
                    const refD = Ref.for(0, 0, 1, 0);
                    const refE = Ref.for(0, 0, 0, 1);

                    const compareRef = Ref.for(0, 0, 0, 0);
                    const test = match.compile(compareRef);

                    expect(test(compareRef)).to.equal(true);
                    expect(test(refA)).to.equal(true);

                    expect(test(refB)).to.equal(false);
                    expect(test(refC)).to.equal(false);
                    expect(test(refD)).to.equal(false);
                    expect(test(refE)).to.equal(false);
                });
            });
        });
    });
});
describe('@otpjs/matching/core/compare', function() {
    describe('given two terms', function() {
        it('treats the first term as a pattern', function() {
            expect(match.compare(/^test_regex$/, 'test_regex')).to.equal(true);
            expect(match.compare(/^test_regex$/, 'test_regexes')).to.equal(false);
            expect(match.compare(_, Infinity)).to.equal(true);
            expect(match.compare(Number.isFinite, Infinity)).to.equal(false);
            expect(
                match.compare({ a: 1, [spread]: _ }, { a: 1, b: 2, c: '3' })
            ).to.equal(true);
            expect(
                match.compare(
                    { a: 1, [spread]: Number.isInteger },
                    {
                        a: 1,
                        b: 2,
                        c: '3',
                    }
                )
            ).to.equal(false);
        });
    });
});
describe('@otpjs/matching/core/match', function() {
    it('returns a function', function() {
        expect(match.match()).to.be.an.instanceOf(Function);
    });
    describe('given a collection of patterns', function() {
        let patternA;
        let patternB;
        let patternC;
        let checkValue;

        beforeEach(function() {
            patternA = sinon.spy(Number.isInteger);
            patternB = sinon.spy(Array.isArray);
            patternC = sinon.spy(Number.isFinite);
            checkValue = [patternA, patternB, patternC];
        });

        describe('the returned function', function() {
            it('returns true if any of the patterns match', function() {
                const matcher = match.match(...checkValue);
                expect(matcher(1)).to.equal(true);
                expect(matcher(3.14)).to.equal(true);
                expect(matcher(Number.MAX_SAFE_INTEGER)).to.equal(true);
                expect(matcher([])).to.equal(true);
                expect(matcher({})).to.equal(false);
                expect(matcher('1')).to.equal(false);
                expect(matcher(Infinity)).to.equal(false);
            });
        });
    });
});
describe('@otpjs/matching/core/oneOf', function() {
    it('matches any supplied pattern', function() {
        const patternA = Number.isInteger;
        const patternB = Array.isArray;
        expect(match.oneOf).to.be.an.instanceOf(Function);
        expect(function() {
            match.oneOf(patternA, patternB);
        }).not.to.throw();
        expect(match.oneOf(patternA, patternB)).to.be.an.instanceOf(Function);

        const test = match.oneOf(patternA, patternB);
        expect(test(1)).to.equal(true);
        expect(test([])).to.equal(true);
        expect(test({})).to.equal(false);
        expect(test('1')).to.equal(false);
    });
});
describe('@otpjs/matching/core/caseOf', function() {
    describe('when given a value', function() {
        it('returns a function', function() {
            const value = 123;
            expect(match.caseOf(value)).to.be.an.instanceOf(Function);
        });

        describe('the returned function', function() {
            describe('given a pattern', function() {
                it('returns true if the value matches the pattern', function() {
                    const valueA = 123;
                    const valueB = '456';

                    const caseA = match.caseOf(valueA);
                    const caseB = match.caseOf(valueB);

                    expect(caseA(valueA)).to.equal(true);
                    expect(caseA(Number.isInteger)).to.equal(true);
                });
            });
        });
    });
});
