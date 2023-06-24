/* eslint-env jest */
import { Ref } from '../src';
import inspect from 'inspect-custom-symbol';
import '@otpjs/test_utils';
import crypto from 'crypto';
import util from 'util';

describe('Ref', function () {
    it('can be made from thin air', function () {
        let result;
        expect(function () {
            result = Ref.for(0, 0, 0);
        }).not.toThrow();
        expect(result).toBeInstanceOf(Ref);
    });
    it('cannot identify Refs from strings', function () {
        expect(Ref.isRef('Ref<0.0.0>')).toBe(false);
    });
    it('can identify Refs from Refs', function () {
        expect(Ref.isRef(Ref.for(0, 0, 0, 0))).toBe(true);
    });
    it('can be converted into a string', function () {
        expect(Ref.for(0, 0, 0, 0).toString()).toBe('Ref<0.0.0>');
    });
    describe('Symbol.toPrimitive', function () {
        it('can be coerced into a string', function () {
            const ref = Ref.for(0, 0, 0, 0);
            const spy = jest.spyOn(ref, Symbol.toPrimitive);
            expect(`${ref}`).toBe('Ref<0.0.0>');
            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('cannot be coerced into a number', function () {
            const ref = Ref.for(0, 0, 0, 0);
            const spy = jest.spyOn(ref, Symbol.toPrimitive);
            expect(+ref).toBe(0);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0]).toBe('number');
            expect(spy.mock.results[0].value).toBe(null);
        });
    });
    describe('inspect', function () {
        it('can be used by node:util', function () {
            const ref = Ref.for(0, 0, 0, 0);
            expect(ref[inspect]).toBeInstanceOf(Function);
            const mock = jest.spyOn(ref, inspect);
            expect(util.inspect(ref, false, 2, false)).toBe('Ref<0.0.0>');
            expect(mock).toHaveBeenCalledTimes(1);
        });
        it('uses a short form below 0 depth', function () {
            const ref = Ref.for(0, 0, 0, 0);
            expect(ref[inspect]).toBeInstanceOf(Function);
            const mock = jest.spyOn(ref, inspect);
            util.inspect(ref, false, -1, false);
            expect(mock).toHaveBeenCalledTimes(1);
            expect(mock.mock.calls[0][0]).toBe(-1);
            expect(mock.mock.results[0].value).toBe('[Ref]');
        });
    });
    describe('fromString', function () {
        it('accepts the format: Ref<#.#.#>', function () {
            expect(function () {
                Ref.fromString('Ref<0.0.0>');
            }).not.toThrow();
        });
        it('returns an instance of Ref', function () {
            expect(Ref.fromString('Ref<0.0.0>')).toBeInstanceOf(Ref);
        });
        it('populates node, id, and serial from the string', function () {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const ref = Ref.fromString(`Ref<${node}.${id}.${serial}>`);

            expect(ref.node).toBe(node);
            expect(ref.id).toBe(id);
            expect(ref.serial).toBe(serial);
        });
        it('assumes creation to be 1', function () {
            const ref = Ref.fromString('Ref<0.0.0>');
            expect(ref.creation).toBe(1);
        });
    });
    describe('compare', function () {
        describe('compares two refs', function () {
            describe('when node', function () {
                describe('is less than the other node', function () {
                    it('returns -1', function () {
                        const refA = Ref.for(0, 0, 0, 0);
                        const refB = Ref.for(1, 0, 0, 0);

                        expect(Ref.compare(refA, refB)).toBe(-1);
                    });
                });
                describe('is more than the other node', function () {
                    it('returns 1', function () {
                        const refA = Ref.for(1, 0, 0, 0);
                        const refB = Ref.for(0, 0, 0, 0);

                        expect(Ref.compare(refA, refB)).toBe(1);
                    });
                });
                describe('is the same as the other node', function () {
                    describe('when id', function () {
                        describe('is less than the other node', function () {
                            it('returns -1', function () {
                                const refA = Ref.for(1, 0, 0, 0);
                                const refB = Ref.for(1, 1, 0, 0);

                                expect(Ref.compare(refA, refB)).toBe(-1);
                            });
                        });
                        describe('is more than the other node', function () {
                            it('returns 1', function () {
                                const refA = Ref.for(1, 1, 0, 0);
                                const refB = Ref.for(1, 0, 0, 0);

                                expect(Ref.compare(refA, refB)).toBe(1);
                            });
                        });
                        describe('is the same as the other node', function () {
                            describe('when serial', function () {
                                describe('is less than the other node', function () {
                                    it('returns -1', function () {
                                        const refA = Ref.for(1, 1, 0, 0);
                                        const refB = Ref.for(1, 1, 1, 0);

                                        expect(Ref.compare(refA, refB)).toBe(
                                            -1
                                        );
                                    });
                                });
                                describe('is more than the other node', function () {
                                    it('returns 1', function () {
                                        const refA = Ref.for(1, 1, 1, 0);
                                        const refB = Ref.for(1, 1, 0, 0);

                                        expect(Ref.compare(refA, refB)).toBe(1);
                                    });
                                });
                                describe('is the same as the other node', function () {
                                    describe('when serial', function () {
                                        describe('is less than the other node', function () {
                                            it('returns -1', function () {
                                                const refA = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    0
                                                );
                                                const refB = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    1
                                                );

                                                expect(
                                                    Ref.compare(refA, refB)
                                                ).toBe(-1);
                                            });
                                        });
                                        describe('is more than the other node', function () {
                                            it('returns 1', function () {
                                                const refA = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    1
                                                );
                                                const refB = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    0
                                                );

                                                expect(
                                                    Ref.compare(refA, refB)
                                                ).toBe(1);
                                            });
                                        });
                                        describe('is the same as the other node', function () {
                                            it('returns 0', function () {
                                                const refA = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    1
                                                );
                                                const refB = Ref.for(
                                                    1,
                                                    1,
                                                    1,
                                                    1
                                                );

                                                expect(
                                                    Ref.compare(refA, refB)
                                                ).toBe(0);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
    describe('has properties', function () {
        let ref;
        let expected;

        beforeEach(function () {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const creation = crypto.randomInt(0xffff);
            const reference = (BigInt(id) << 32n) | BigInt(serial);

            expected = { node, id, serial, creation, reference };
            ref = Ref.for(node, id, serial, creation);
        });

        describe('node', function () {
            it('is an integer', function () {
                expect(typeof ref.node).toBe('number');
                expect(ref.node).toBe(expected.node);
                expect(Number.isInteger(ref.node)).toBe(true);
            });
        });
        describe('id', function () {
            it('is an integer', function () {
                expect(typeof ref.id).toBe('number');
                expect(ref.id).toBe(expected.id);
                expect(Number.isInteger(ref.id)).toBe(true);
            });
        });
        describe('serial', function () {
            it('is an integer', function () {
                expect(typeof ref.serial).toBe('number');
                expect(ref.serial).toBe(expected.serial);
                expect(Number.isInteger(ref.serial)).toBe(true);
            });
        });
        describe('creation', function () {
            it('is an integer', function () {
                expect(typeof ref.creation).toBe('number');
                expect(ref.creation).toBe(expected.creation);
                expect(Number.isInteger(ref.creation)).toBe(true);
            });
        });
        describe('reference', function () {
            it('is a big integer', function () {
                expect(typeof ref.reference).toBe('bigint');
                expect(ref.reference).toBe(expected.reference);
            });
        });
    });
});
