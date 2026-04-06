/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { OTPError, t } from '@otpjs/types';
import * as matching from '../lib/index.js';
import { case_clause, route_clause, skip_matching, _ } from '#symbols';
import patternMatching from '#chai';

chai.use(patternMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

describe('@otpjs/matching/advanced', function () {
    describe('buildCase', function () {
        it('takes a "build function" argument', function () {
            const fn = sinon.spy();
            expect(function () {
                matching.buildCase();
            }).to.throw();
            expect(function () {
                matching.buildCase(fn);
            }).not.to.throw();
        });
        describe('build function', function () {
            let fn;
            beforeEach(function () {
                fn = sinon.spy();
            });
            it('is called with "build case" helper method', function () {
                matching.buildCase(fn);
                expect(fn).to.have.callCount(1);
                expect(fn.getCall(0).args[0]).to.be.an.instanceOf(Function);
            });
            describe('case builder', function () {
                let catchAll;
                let numbersOnly;
                beforeEach(function () {
                    catchAll = handler(() => 0);
                    numbersOnly = handler(() => 1);
                });

                it('needs "pattern" and "handler" arguments', function () {
                    fn = sinon.spy((kase) => {
                        expect(() => kase()).to.throw();
                        expect(() => kase(_)).to.throw();
                        expect(() => kase(_, catchAll)).not.to.throw();
                    });
                    matching.buildCase(fn);
                });

                it('returns a compiled case block', function () {
                    fn = sinon.spy((kase) => {
                        kase(Number.isInteger, numbersOnly);
                        kase(_, catchAll);
                    });
                    const block = matching.buildCase(fn);
                    expect(block).to.be.an.instanceOf(Object);
                });

                describe('compiled case block', function () {
                    let block;
                    let handlerA;
                    let handlerB;
                    let handlerC;
                    beforeEach(function () {
                        handlerA = handler((_value) => 0);
                        handlerB = handler((_value) => 1);
                        handlerC = handler((_value) => 2);
                        fn = (kase) => {
                            kase(t(0, 0), handlerA);
                            kase(t(0, _), handlerB);
                            kase(t(_, _), handlerC);
                        };
                        block = matching.buildCase(fn);
                    });
                    describe('has properties "for" and "with"', function () {
                        describe('for', function () {
                            it('returns the first matching handler without calling it', function () {
                                expect(block.for(t(0, 0))).to.equal(handlerA);
                                expect(handlerA.inner).not.to.have.been.called;
                                expect(handlerB.inner).not.to.have.been.called;
                                expect(handlerC.inner).not.to.have.been.called;

                                expect(block.for(t(0, 1))).to.equal(handlerB);
                                expect(handlerA.inner).not.to.have.been.called;
                                expect(handlerB.inner).not.to.have.been.called;
                                expect(handlerC.inner).not.to.have.been.called;

                                expect(block.for(t(1, 1))).to.equal(handlerC);
                                expect(handlerA.inner).not.to.have.been.called;
                                expect(handlerB.inner).not.to.have.been.called;
                                expect(handlerC.inner).not.to.have.been.called;
                            });

                            describe('with no matching handler', function () {
                                it('throws a case_clause error', function () {
                                    let error;
                                    expect(() => {
                                        try {
                                            block.for(1);
                                        } catch (err) {
                                            error = err;
                                            throw err;
                                        }
                                    }).to.throw();

                                    expect(error).to.be.an.instanceOf(OTPError);
                                    expect(error.term).to.equal(case_clause);
                                });
                            });
                        });
                        describe('with', function () {
                            it('runs the first matching handler', function () {
                                expect(block.with(t(0, 0))).to.equal(0);
                                expect(handlerA.inner).to.have.been.called;
                                expect(handlerB.inner).not.to.have.been.called;
                                expect(handlerC.inner).not.to.have.been.called;

                                sinon.reset();

                                expect(block.with(t(0, 1))).to.equal(1);
                                expect(handlerA.inner).not.to.have.been.called;
                                expect(handlerB.inner).to.have.been.called;
                                expect(handlerC.inner).not.to.have.been.called;

                                sinon.reset();

                                expect(block.with(t(1, 1))).to.equal(2);
                                expect(handlerA.inner).not.to.have.been.called;
                                expect(handlerB.inner).not.to.have.been.called;
                                expect(handlerC.inner).to.have.been.called;
                            });

                            describe('with no matching handler', function () {
                                it('throws a case_clause error', function () {
                                    let error;
                                    expect(() => {
                                        try {
                                            block.with(1);
                                        } catch (err) {
                                            error = err;
                                            throw err;
                                        }
                                    }).to.throw();

                                    expect(error).to.be.an.instanceOf(OTPError);
                                    expect(error.term).to.equal(case_clause);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
    describe('clauses', function () {
        it('takes a "build function" argument', function () {
            const fn = sinon.spy();
            expect(function () {
                matching.clauses();
            }).to.throw();
            expect(function () {
                matching.clauses(fn);
            }).not.to.throw();
        });
        describe('build function', function () {
            let fn;
            beforeEach(function () {
                fn = sinon.spy();
            });
            it('is called with "build case" helper method', function () {
                matching.clauses(fn);
                expect(fn).to.have.callCount(1);
                expect(fn.getCall(0).args[0]).to.be.an.instanceOf(Function);
            });
            describe('clause builder', function () {
                it('returns a clause mapper', function () {
                    matching.clauses((kase) => {
                        const mapperA = kase(Number.isInteger);
                        expect(mapperA).to.be.an.instanceOf(Object);
                        expect(mapperA).to.have.property('to');
                    });
                });

                describe('clause mapper', function () {
                    it('needs a handler function', function () {
                        matching.clauses((route) => {
                            const mapper = route(Number.isInteger);
                            expect(function () {
                                mapper.to();
                            }).to.throw();
                        });
                        matching.clauses((route) => {
                            const mapper = route(Number.isInteger);
                            expect(function () {
                                mapper.to(() => true);
                            }).not.to.throw();
                        });
                    });
                });
            });
            describe('compiled clauses', function () {
                let fn;
                let handlerA;
                let handlerB;
                let handlerC;

                beforeEach(function () {
                    handlerA = handler((value) => 0);
                    handlerB = handler((value) => 1);
                    handlerC = handler((value) => 2);
                    fn = matching.clauses((route) => {
                        route(0, 0).to(handlerA);
                        route(0, _).to(handlerB);
                        route(_, _).to(handlerC);
                    });
                });

                it('returns the first handler matching the arguments', function () {
                    expect(fn(0, 0)).to.equal(0);
                    expect(handlerA.inner).to.have.been.called;
                    expect(handlerB.inner).not.to.have.been.called;
                    expect(handlerC.inner).not.to.have.been.called;

                    sinon.reset();

                    expect(fn(0, 1)).to.equal(1);
                    expect(handlerA.inner).not.to.have.been.called;
                    expect(handlerB.inner).to.have.been.called;
                    expect(handlerC.inner).not.to.have.been.called;

                    sinon.reset();

                    expect(fn(1, 1)).to.equal(2);
                    expect(handlerA.inner).not.to.have.been.called;
                    expect(handlerB.inner).not.to.have.been.called;
                    expect(handlerC.inner).to.have.been.called;
                });
                describe('a skip-marked argument', function () {
                    it('is not considered', function () {
                        const skipMe = { [skip_matching]: true };
                        expect(function () {
                            fn(skipMe, 0, 0);
                        }).not.to.throw();
                        expect(handlerA.inner).to.have.been.called;

                        sinon.reset();

                        expect(function () {
                            fn(0, skipMe, 1);
                        }).not.to.throw();
                        expect(handlerB.inner).to.have.been.called;

                        sinon.reset();

                        expect(function () {
                            fn(1, 1, skipMe);
                        }).not.to.throw();
                        expect(handlerC.inner).to.have.been.called;
                    });
                });

                describe('with no matching handler', function () {
                    it('throws a route_clause error', function () {
                        let error;
                        expect(() => {
                            try {
                                fn(1);
                            } catch (err) {
                                error = err;
                                throw err;
                            }
                        }).to.throw();

                        expect(error).to.be.an.instanceOf(OTPError);
                        expect(error.term).to.equal(route_clause);
                    });
                });
            });
        });
    });
    describe('kase', function () {
        it('returns a kase block', function () {
            expect(() => matching.kase()).not.to.throw();
            const blockBuilder = matching.kase();
            expect(blockBuilder).to.be.an.instanceOf(Object);
            expect(blockBuilder.of).to.be.an.instanceOf(Function);
        });

        describe('block', function () {
            let block;
            beforeEach(function () {
                block = matching.kase();
            });
            it('runs a provided builder function', function () {
                const block = matching.kase();
                const result = block.of((builder) => {
                    expect(builder).to.be.an.instanceOf(Function);
                    const clause = builder(_);
                    expect(clause).to.be.an.instanceOf(Object);
                    expect(clause.then).to.be.an.instanceOf(Function);
                    expect(clause.when).to.be.an.instanceOf(Function);
                    clause.then(() => true);
                });
                expect(result).to.equal(true);
            });
            describe('with a matching clause', function () {
                describe('with no guards', function () {
                    it('returns the result of that clause', function () {
                        const payload = 123;
                        const isNumber = sinon.spy((id) => id);
                        const isArray = sinon.spy((id) => id);
                        const result = matching.kase(payload).of((match) => {
                            match(Array.isArray).then(isArray);
                            match(Number.isInteger).then(isNumber);
                        });
                        expect(result).to.equal(payload);
                        expect(isNumber).to.have.been.calledWith(payload);
                        expect(isArray).not.to.have.been.called;
                    });
                });
                describe('with passing guards', function () {
                    it('returns the result of that clause', function () {
                        const payload = 123;
                        const isNumber = sinon.spy((id) => id);
                        const isArray = sinon.spy((id) => id);
                        const result = matching.kase(payload).of((match) => {
                            match(Array.isArray)
                                .when((value) => value.length > 100)
                                .then(isArray);
                            match(Number.isInteger)
                                .when((value) => value > 100)
                                .then(isNumber);
                        });
                        expect(result).to.equal(payload);
                        expect(isNumber).to.have.been.calledWith(payload);
                        expect(isArray).not.to.have.been.called;
                    });
                });
                describe('with failing guards', function () {
                    it('throws a case_clause error', function () {
                        const payload = 123;
                        const isNumber = sinon.spy();
                        const isArray = sinon.spy();

                        expect(() => {
                            matching.kase(payload).of((match) => {
                                match(Number.isInteger)
                                    .when((value) => value < 100)
                                    .then(isNumber);
                                match(Array.isArray)
                                    .when((value) => value.length < 1)
                                    .then(isArray);
                            });
                        }).to.throwTerm(case_clause);
                        expect(isNumber).not.to.have.been.called;
                        expect(isArray).not.to.have.been.called;
                    });
                });
            });
            describe('without a matching clause', function () {
                it('throws a case_clause error', function () {
                    const payload = '123';
                    const isNumber = sinon.spy();
                    const isArray = sinon.spy();

                    expect(function () {
                        matching.kase(payload).of((match) => {
                            match(Number.isInteger).then(isNumber);
                            match(Array.isArray).then(isArray);
                        });
                    }).to.throwTerm(case_clause);
                    expect(isNumber).not.to.have.been.called;
                    expect(isArray).not.to.have.been.called;
                });
            });
        });
    });
});

function handler(fn) {
    const inner = sinon.spy(fn);
    const outer = (...args) => inner(...args);
    outer.inner = inner;
    return outer;
}
