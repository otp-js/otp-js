/* eslint-env mocha */
import * as chai from 'chai';
import crypto from 'crypto';
import * as sinon from 'sinon';
import util from 'util';
import { Ref } from '../lib/index.js';

const { expect } = chai;

afterEach(function () {
    sinon.restore();
});

const inspect = Symbol.for('nodejs.util.inspect.custom');

describe('Ref', function () {
    it('can be made from thin air', function () {
        let result;
        expect(function () {
            result = Ref.for(0, 0, 0);
        }).not.to.throw();
        expect(result).to.be.an.instanceOf(Ref);
    });
    it('cannot identify Refs from strings', function () {
        expect(Ref.isRef('Ref<0.0.0>')).to.equal(false);
    });
    it('can identify Refs from Refs', function () {
        expect(Ref.isRef(Ref.for(0, 0, 0, 0))).to.equal(true);
    });
    it('can be converted into a string', function () {
        expect(Ref.for(0, 0, 0, 0).toString()).to.equal('Ref<0.0.0>');
    });
    describe('Symbol.toPrimitive', function () {
        it('can be coerced into a string', function () {
            const ref = Ref.for(0, 0, 0, 0);
            const spy = sinon.spy(ref, Symbol.toPrimitive);
            expect(`${ref}`).to.equal('Ref<0.0.0>');
            expect(spy).to.have.callCount(1);
        });
        it('cannot be coerced into a number', function () {
            const ref = Ref.for(0, 0, 0, 0);
            const spy = sinon.spy(ref, Symbol.toPrimitive);
            expect(+ref).to.equal(0);
            expect(spy).to.have.callCount(1);
            expect(spy.getCall(0).args[0]).to.equal('number');
            expect(spy.getCall(0).returnValue).to.equal(null);
        });
    });
    describe('inspect', function () {
        it('can be used by node:util', function () {
            const ref = Ref.for(0, 0, 0, 0);
            expect(ref[inspect]).to.be.an.instanceOf(Function);
            const mock = sinon.spy(ref, inspect);
            expect(util.inspect(ref, false, 2, false)).to.equal('Ref<0.0.0>');
            expect(mock).to.have.callCount(1);
        });
        it('uses a short form below 0 depth', function () {
            const ref = Ref.for(0, 0, 0, 0);
            expect(ref[inspect]).to.be.an.instanceOf(Function);
            const mock = sinon.spy(ref, inspect);
            util.inspect(ref, false, -1, false);
            expect(mock).to.have.callCount(1);
            expect(mock.getCall(0).args[0]).to.equal(-1);
            expect(mock.getCall(0).returnValue).to.equal('[Ref]');
        });
    });
    describe('fromString', function () {
        it('accepts the format: Ref<#.#.#>', function () {
            expect(function () {
                Ref.fromString('Ref<0.0.0>');
            }).not.to.throw();
        });
        it('returns an instance of Ref', function () {
            expect(Ref.fromString('Ref<0.0.0>')).to.be.an.instanceOf(Ref);
        });
        it('populates node, id, and serial from the string', function () {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const ref = Ref.fromString(`Ref<${node}.${id}.${serial}>`);

            expect(ref.node).to.equal(node);
            expect(ref.id).to.equal(id);
            expect(ref.serial).to.equal(serial);
        });
        it('assumes creation to be 1', function () {
            const ref = Ref.fromString('Ref<0.0.0>');
            expect(ref.creation).to.equal(1);
        });
    });
    describe('compare', function () {
        describe('compares two refs', function () {
            describe('when node', function () {
                describe('is less than the other node', function () {
                    it('returns -1', function () {
                        const refA = Ref.for(0, 0, 0, 0);
                        const refB = Ref.for(1, 0, 0, 0);

                        expect(Ref.compare(refA, refB)).to.equal(-1);
                    });
                });
                describe('is more than the other node', function () {
                    it('returns 1', function () {
                        const refA = Ref.for(1, 0, 0, 0);
                        const refB = Ref.for(0, 0, 0, 0);

                        expect(Ref.compare(refA, refB)).to.equal(1);
                    });
                });
                describe('is the same as the other node', function () {
                    describe('when id', function () {
                        describe('is less than the other node', function () {
                            it('returns -1', function () {
                                const refA = Ref.for(1, 0, 0, 0);
                                const refB = Ref.for(1, 1, 0, 0);

                                expect(Ref.compare(refA, refB)).to.equal(-1);
                            });
                        });
                        describe('is more than the other node', function () {
                            it('returns 1', function () {
                                const refA = Ref.for(1, 1, 0, 0);
                                const refB = Ref.for(1, 0, 0, 0);

                                expect(Ref.compare(refA, refB)).to.equal(1);
                            });
                        });
                        describe('is the same as the other node', function () {
                            describe('when serial', function () {
                                describe('is less than the other node', function () {
                                    it('returns -1', function () {
                                        const refA = Ref.for(1, 1, 0, 0);
                                        const refB = Ref.for(1, 1, 1, 0);

                                        expect(
                                            Ref.compare(refA, refB)
                                        ).to.equal(-1);
                                    });
                                });
                                describe('is more than the other node', function () {
                                    it('returns 1', function () {
                                        const refA = Ref.for(1, 1, 1, 0);
                                        const refB = Ref.for(1, 1, 0, 0);

                                        expect(
                                            Ref.compare(refA, refB)
                                        ).to.equal(1);
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
                                                ).to.equal(-1);
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
                                                ).to.equal(1);
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
                                                ).to.equal(0);
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
                expect(typeof ref.node).to.equal('number');
                expect(ref.node).to.equal(expected.node);
                expect(Number.isInteger(ref.node)).to.equal(true);
            });
        });
        describe('id', function () {
            it('is an integer', function () {
                expect(typeof ref.id).to.equal('number');
                expect(ref.id).to.equal(expected.id);
                expect(Number.isInteger(ref.id)).to.equal(true);
            });
        });
        describe('serial', function () {
            it('is an integer', function () {
                expect(typeof ref.serial).to.equal('number');
                expect(ref.serial).to.equal(expected.serial);
                expect(Number.isInteger(ref.serial)).to.equal(true);
            });
        });
        describe('creation', function () {
            it('is an integer', function () {
                expect(typeof ref.creation).to.equal('number');
                expect(ref.creation).to.equal(expected.creation);
                expect(Number.isInteger(ref.creation)).to.equal(true);
            });
        });
        describe('reference', function () {
            it('is a big integer', function () {
                expect(typeof ref.reference).to.equal('bigint');
                expect(ref.reference).to.equal(expected.reference);
            });
        });
    });
});
