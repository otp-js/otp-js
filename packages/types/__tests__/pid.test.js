/* eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import crypto from 'crypto';
import inspect from 'inspect-custom-symbol';
import util from 'util';
import { Pid } from '../lib/index.js';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

afterEach(function() {
    sinon.restore();
})

describe('Pid', function() {
    it('cannot identify Pids from strings', function() {
        expect(Pid.isPid('Pid<0.0>')).to.equal(false);
    });
    it('can identify Pids from Pids', function() {
        expect(Pid.isPid(Pid.of(0, 0, 0, 0))).to.equal(true);
    });
    it('can be converted into a string', function() {
        expect(Pid.of(0, 0, 0, 0).toString()).to.equal('Pid<0.0.0>');
    });
    it('can be made from thin air', function() {
        let result;
        expect(function() {
            result = Pid.of(0, 0, 0);
        }).not.to.throw();
        expect(result).to.be.an.instanceOf(Pid);
    });
    describe('inspect', function() {
        it('can be used by node:util', function() {
            const pid = Pid.of(0, 0, 0, 0);
            expect(pid[inspect]).to.be.an.instanceOf(Function);
            const mock = sinon.spy(pid, inspect);
            expect(util.inspect(pid, false, 2, false)).to.equal('Pid<0.0.0>');
            expect(mock).to.have.callCount(1);
        });
        it('uses a short form below 0 depth', function() {
            const pid = Pid.of(0, 0, 0, 0);
            expect(pid[inspect]).to.be.an.instanceOf(Function);
            const mock = sinon.spy(pid, inspect);
            util.inspect(pid, false, -1, false);
            expect(mock).to.have.callCount(1);
            expect(mock.getCall(0).args[0]).to.equal(-1);
            expect(mock.getCall(0).returnValue).to.equal('[Pid]');
        });
    });
    describe('fromString', function() {
        it('accepts the format: Pid<#.#.#>', function() {
            expect(function() {
                Pid.fromString('Pid<0.0.0>');
            }).not.to.throw();
        });
        it('returns an instance of Pid', function() {
            expect(Pid.fromString('Pid<0.0.0>')).to.be.an.instanceOf(Pid);
        });
        it('populates node, id, and serial from the string', function() {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const pid = Pid.fromString(`Pid<${node}.${id}.${serial}>`);

            expect(pid.node).to.equal(node);
            expect(pid.id).to.equal(id);
            expect(pid.serial).to.equal(serial);
        });
        it('assumes creation to be 1', function() {
            const pid = Pid.fromString('Pid<0.0.0>');
            expect(pid.creation).to.equal(1);
        });
    });
    describe('compare', function() {
        describe('compares two pids', function() {
            describe('when node', function() {
                describe('is less than the other node', function() {
                    it('returns -1', function() {
                        const pidA = Pid.of(0, 0, 0, 0);
                        const pidB = Pid.of(1, 0, 0, 0);

                        expect(Pid.compare(pidA, pidB)).to.equal(-1);
                    });
                });
                describe('is more than the other node', function() {
                    it('returns 1', function() {
                        const pidA = Pid.of(1, 0, 0, 0);
                        const pidB = Pid.of(0, 0, 0, 0);

                        expect(Pid.compare(pidA, pidB)).to.equal(1);
                    });
                });
                describe('is the same as the other node', function() {
                    describe('when id', function() {
                        describe('is less than the other node', function() {
                            it('returns -1', function() {
                                const pidA = Pid.of(1, 0, 0, 0);
                                const pidB = Pid.of(1, 1, 0, 0);

                                expect(Pid.compare(pidA, pidB)).to.equal(-1);
                            });
                        });
                        describe('is more than the other node', function() {
                            it('returns 1', function() {
                                const pidA = Pid.of(1, 1, 0, 0);
                                const pidB = Pid.of(1, 0, 0, 0);

                                expect(Pid.compare(pidA, pidB)).to.equal(1);
                            });
                        });
                        describe('is the same as the other node', function() {
                            describe('when serial', function() {
                                describe('is less than the other node', function() {
                                    it('returns -1', function() {
                                        const pidA = Pid.of(1, 1, 0, 0);
                                        const pidB = Pid.of(1, 1, 1, 0);

                                        expect(Pid.compare(pidA, pidB)).to.equal(
                                            -1
                                        );
                                    });
                                });
                                describe('is more than the other node', function() {
                                    it('returns 1', function() {
                                        const pidA = Pid.of(1, 1, 1, 0);
                                        const pidB = Pid.of(1, 1, 0, 0);

                                        expect(Pid.compare(pidA, pidB)).to.equal(1);
                                    });
                                });
                                describe('is the same as the other node', function() {
                                    describe('when serial', function() {
                                        describe('is less than the other node', function() {
                                            it('returns -1', function() {
                                                const pidA = Pid.of(1, 1, 1, 0);
                                                const pidB = Pid.of(1, 1, 1, 1);

                                                expect(
                                                    Pid.compare(pidA, pidB)
                                                ).to.equal(-1);
                                            });
                                        });
                                        describe('is more than the other node', function() {
                                            it('returns 1', function() {
                                                const pidA = Pid.of(1, 1, 1, 1);
                                                const pidB = Pid.of(1, 1, 1, 0);

                                                expect(
                                                    Pid.compare(pidA, pidB)
                                                ).to.equal(1);
                                            });
                                        });
                                        describe('is the same as the other node', function() {
                                            it('returns 0', function() {
                                                const pidA = Pid.of(1, 1, 1, 1);
                                                const pidB = Pid.of(1, 1, 1, 1);

                                                expect(
                                                    Pid.compare(pidA, pidB)
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

    describe('has properties', function() {
        let pid;
        let expected;

        beforeEach(function() {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const creation = crypto.randomInt(0xffff);
            const process = (BigInt(id) << 32n) | BigInt(serial);

            expected = { node, id, serial, creation, process };
            pid = Pid.of(node, id, serial, creation);
        });

        describe('node', function() {
            it('is an integer', function() {
                expect(typeof pid.node).to.equal('number');
                expect(pid.node).to.equal(expected.node);
                expect(Number.isInteger(pid.node)).to.equal(true);
            });
        });
        describe('id', function() {
            it('is an integer', function() {
                expect(typeof pid.id).to.equal('number');
                expect(pid.id).to.equal(expected.id);
                expect(Number.isInteger(pid.id)).to.equal(true);
            });
        });
        describe('serial', function() {
            it('is an integer', function() {
                expect(typeof pid.serial).to.equal('number');
                expect(pid.serial).to.equal(expected.serial);
                expect(Number.isInteger(pid.serial)).to.equal(true);
            });
        });
        describe('creation', function() {
            it('is an integer', function() {
                expect(typeof pid.creation).to.equal('number');
                expect(pid.creation).to.equal(expected.creation);
                expect(Number.isInteger(pid.creation)).to.equal(true);
            });
        });
        describe('process', function() {
            it('is a big integer', function() {
                expect(typeof pid.process).to.equal('bigint');
                expect(pid.process).to.equal(expected.process);
            });
        });
    });
});
