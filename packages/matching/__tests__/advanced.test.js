/* eslint-env jest */
import { OTPError, t } from '@otpjs/types';
import * as matching from '../src';
import {
    case_clause,
    route_clause,
    skip_matching, _
} from '../src/symbols';
import './extend';

describe('@otpjs/matching/advanced', function () {
    describe('buildCase', function () {
        it('takes a "build function" argument', function () {
            const fn = jest.fn();
            expect(function () {
                matching.buildCase();
            }).toThrow();
            expect(function () {
                matching.buildCase(fn);
            }).not.toThrow();
        });
        describe('build function', function () {
            let fn;
            beforeEach(function () {
                fn = jest.fn();
            });
            it('is called with "build case" helper method', function () {
                matching.buildCase(fn);
                expect(fn).toHaveBeenCalledTimes(1);
                expect(fn.mock.calls[0][0]).toBeInstanceOf(Function);
            });
            describe('case builder', function () {
                let catchAll;
                let numbersOnly;
                beforeEach(function () {
                    catchAll = handler(() => 0);
                    numbersOnly = handler(() => 1);
                });

                it('needs "pattern" and "handler" arguments', function () {
                    fn = jest.fn((kase) => {
                        expect(() => kase()).toThrow();
                        expect(() => kase(_)).toThrow();
                        expect(() => kase(_, catchAll)).not.toThrow();
                    });
                    matching.buildCase(fn);
                });

                it('returns a compiled case block', function () {
                    fn = jest.fn((kase) => {
                        kase(Number.isInteger, numbersOnly);
                        kase(_, catchAll);
                    });
                    const block = matching.buildCase(fn);
                    expect(block).toBeInstanceOf(Object);
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
                                expect(block.for(t(0, 0))).toBe(handlerA);
                                expect(handlerA.inner).not.toHaveBeenCalled();
                                expect(handlerB.inner).not.toHaveBeenCalled();
                                expect(handlerC.inner).not.toHaveBeenCalled();

                                expect(block.for(t(0, 1))).toBe(handlerB);
                                expect(handlerA.inner).not.toHaveBeenCalled();
                                expect(handlerB.inner).not.toHaveBeenCalled();
                                expect(handlerC.inner).not.toHaveBeenCalled();

                                expect(block.for(t(1, 1))).toBe(handlerC);
                                expect(handlerA.inner).not.toHaveBeenCalled();
                                expect(handlerB.inner).not.toHaveBeenCalled();
                                expect(handlerC.inner).not.toHaveBeenCalled();
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
                                    }).toThrow();

                                    expect(error).toBeInstanceOf(OTPError);
                                    expect(error.term).toBe(case_clause);
                                });
                            });
                        });
                        describe('with', function () {
                            it('runs the first matching handler', function () {
                                expect(block.with(t(0, 0))).toBe(0);
                                expect(handlerA.inner).toHaveBeenCalled();
                                expect(handlerB.inner).not.toHaveBeenCalled();
                                expect(handlerC.inner).not.toHaveBeenCalled();

                                jest.clearAllMocks();

                                expect(block.with(t(0, 1))).toBe(1);
                                expect(handlerA.inner).not.toHaveBeenCalled();
                                expect(handlerB.inner).toHaveBeenCalled();
                                expect(handlerC.inner).not.toHaveBeenCalled();

                                jest.clearAllMocks();

                                expect(block.with(t(1, 1))).toBe(2);
                                expect(handlerA.inner).not.toHaveBeenCalled();
                                expect(handlerB.inner).not.toHaveBeenCalled();
                                expect(handlerC.inner).toHaveBeenCalled();
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
                                    }).toThrow();

                                    expect(error).toBeInstanceOf(OTPError);
                                    expect(error.term).toBe(case_clause);
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
            const fn = jest.fn();
            expect(function () {
                matching.clauses();
            }).toThrow();
            expect(function () {
                matching.clauses(fn);
            }).not.toThrow();
        });
        describe('build function', function () {
            let fn;
            beforeEach(function () {
                fn = jest.fn();
            });
            it('is called with "build case" helper method', function () {
                matching.clauses(fn);
                expect(fn).toHaveBeenCalledTimes(1);
                expect(fn.mock.calls[0][0]).toBeInstanceOf(Function);
            });
            describe('clause builder', function () {
                it('returns a clause mapper', function () {
                    matching.clauses((kase) => {
                        const mapperA = kase(Number.isInteger);
                        expect(mapperA).toBeInstanceOf(Object);
                        expect(mapperA).toHaveProperty('to');
                    });
                });

                describe('clause mapper', function () {
                    it('needs a handler function', function () {
                        matching.clauses((route) => {
                            const mapper = route(Number.isInteger);
                            expect(function () {
                                mapper.to();
                            }).toThrow();
                        });
                        matching.clauses((route) => {
                            const mapper = route(Number.isInteger);
                            expect(function () {
                                mapper.to(() => true);
                            }).not.toThrow();
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
                    expect(fn(0, 0)).toBe(0);
                    expect(handlerA.inner).toHaveBeenCalled();
                    expect(handlerB.inner).not.toHaveBeenCalled();
                    expect(handlerC.inner).not.toHaveBeenCalled();

                    jest.clearAllMocks();

                    expect(fn(0, 1)).toBe(1);
                    expect(handlerA.inner).not.toHaveBeenCalled();
                    expect(handlerB.inner).toHaveBeenCalled();
                    expect(handlerC.inner).not.toHaveBeenCalled();

                    jest.clearAllMocks();

                    expect(fn(1, 1)).toBe(2);
                    expect(handlerA.inner).not.toHaveBeenCalled();
                    expect(handlerB.inner).not.toHaveBeenCalled();
                    expect(handlerC.inner).toHaveBeenCalled();
                });
                describe('a skip-marked argument', function () {
                    it('is not considered', function () {
                        const skipMe = { [skip_matching]: true };
                        expect(function () {
                            fn(skipMe, 0, 0);
                        }).not.toThrow();
                        expect(handlerA.inner).toHaveBeenCalled();

                        jest.clearAllMocks();

                        expect(function () {
                            fn(0, skipMe, 1);
                        }).not.toThrow();
                        expect(handlerB.inner).toHaveBeenCalled();

                        jest.clearAllMocks();

                        expect(function () {
                            fn(1, 1, skipMe);
                        }).not.toThrow();
                        expect(handlerC.inner).toHaveBeenCalled();
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
                        }).toThrow();

                        expect(error).toBeInstanceOf(OTPError);
                        expect(error.term).toBe(route_clause);
                    });
                });
            });
        });
    });
});

function handler(fn) {
    const inner = jest.fn(fn);
    const outer = (...args) => inner(...args);
    outer.inner = inner;
    return outer;
}
