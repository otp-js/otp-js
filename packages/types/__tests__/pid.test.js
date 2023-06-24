/* eslint-env jest */
import '@otpjs/test_utils';
import { Pid } from '../src';
import inspect from 'inspect-custom-symbol';
import crypto from 'crypto';
import util from 'util';

describe('Pid', function () {
    it('cannot identify Pids from strings', function () {
        expect(Pid.isPid('Pid<0.0>')).toBe(false);
    });
    it('can identify Pids from Pids', function () {
        expect(Pid.isPid(Pid.of(0, 0, 0, 0))).toBe(true);
    });
    it('can be converted into a string', function () {
        expect(Pid.of(0, 0, 0, 0).toString()).toBe('Pid<0.0.0>');
    });
    it('can be made from thin air', function () {
        let result;
        expect(function () {
            result = Pid.of(0, 0, 0);
        }).not.toThrow();
        expect(result).toBeInstanceOf(Pid);
    });
    describe('inspect', function () {
        it('can be used by node:util', function () {
            const pid = Pid.of(0, 0, 0, 0);
            expect(pid[inspect]).toBeInstanceOf(Function);
            const mock = jest.spyOn(pid, inspect);
            expect(util.inspect(pid, false, 2, false)).toBe('Pid<0.0.0>');
            expect(mock).toHaveBeenCalledTimes(1);
        });
        it('uses a short form below 0 depth', function () {
            const pid = Pid.of(0, 0, 0, 0);
            expect(pid[inspect]).toBeInstanceOf(Function);
            const mock = jest.spyOn(pid, inspect);
            util.inspect(pid, false, -1, false);
            expect(mock).toHaveBeenCalledTimes(1);
            expect(mock.mock.calls[0][0]).toBe(-1);
            expect(mock.mock.results[0].value).toBe('[Pid]');
        });
    });
    describe('fromString', function () {
        it('accepts the format: Pid<#.#.#>', function () {
            expect(function () {
                Pid.fromString('Pid<0.0.0>');
            }).not.toThrow();
        });
        it('returns an instance of Pid', function () {
            expect(Pid.fromString('Pid<0.0.0>')).toBeInstanceOf(Pid);
        });
        it('populates node, id, and serial from the string', function () {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const pid = Pid.fromString(`Pid<${node}.${id}.${serial}>`);

            expect(pid.node).toBe(node);
            expect(pid.id).toBe(id);
            expect(pid.serial).toBe(serial);
        });
        it('assumes creation to be 1', function () {
            const pid = Pid.fromString('Pid<0.0.0>');
            expect(pid.creation).toBe(1);
        });
    });
    describe('compare', function () {
        describe('compares two pids', function () {
            describe('when node', function () {
                describe('is less than the other node', function () {
                    it('returns -1', function () {
                        const pidA = Pid.of(0, 0, 0, 0);
                        const pidB = Pid.of(1, 0, 0, 0);

                        expect(Pid.compare(pidA, pidB)).toBe(-1);
                    });
                });
                describe('is more than the other node', function () {
                    it('returns 1', function () {
                        const pidA = Pid.of(1, 0, 0, 0);
                        const pidB = Pid.of(0, 0, 0, 0);

                        expect(Pid.compare(pidA, pidB)).toBe(1);
                    });
                });
                describe('is the same as the other node', function () {
                    describe('when id', function () {
                        describe('is less than the other node', function () {
                            it('returns -1', function () {
                                const pidA = Pid.of(1, 0, 0, 0);
                                const pidB = Pid.of(1, 1, 0, 0);

                                expect(Pid.compare(pidA, pidB)).toBe(-1);
                            });
                        });
                        describe('is more than the other node', function () {
                            it('returns 1', function () {
                                const pidA = Pid.of(1, 1, 0, 0);
                                const pidB = Pid.of(1, 0, 0, 0);

                                expect(Pid.compare(pidA, pidB)).toBe(1);
                            });
                        });
                        describe('is the same as the other node', function () {
                            describe('when serial', function () {
                                describe('is less than the other node', function () {
                                    it('returns -1', function () {
                                        const pidA = Pid.of(1, 1, 0, 0);
                                        const pidB = Pid.of(1, 1, 1, 0);

                                        expect(Pid.compare(pidA, pidB)).toBe(
                                            -1
                                        );
                                    });
                                });
                                describe('is more than the other node', function () {
                                    it('returns 1', function () {
                                        const pidA = Pid.of(1, 1, 1, 0);
                                        const pidB = Pid.of(1, 1, 0, 0);

                                        expect(Pid.compare(pidA, pidB)).toBe(1);
                                    });
                                });
                                describe('is the same as the other node', function () {
                                    describe('when serial', function () {
                                        describe('is less than the other node', function () {
                                            it('returns -1', function () {
                                                const pidA = Pid.of(1, 1, 1, 0);
                                                const pidB = Pid.of(1, 1, 1, 1);

                                                expect(
                                                    Pid.compare(pidA, pidB)
                                                ).toBe(-1);
                                            });
                                        });
                                        describe('is more than the other node', function () {
                                            it('returns 1', function () {
                                                const pidA = Pid.of(1, 1, 1, 1);
                                                const pidB = Pid.of(1, 1, 1, 0);

                                                expect(
                                                    Pid.compare(pidA, pidB)
                                                ).toBe(1);
                                            });
                                        });
                                        describe('is the same as the other node', function () {
                                            it('returns 0', function () {
                                                const pidA = Pid.of(1, 1, 1, 1);
                                                const pidB = Pid.of(1, 1, 1, 1);

                                                expect(
                                                    Pid.compare(pidA, pidB)
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
        let pid;
        let expected;

        beforeEach(function () {
            const node = crypto.randomInt(0xffff);
            const id = crypto.randomInt(0xffffffff);
            const serial = crypto.randomInt(0xffffffff);
            const creation = crypto.randomInt(0xffff);
            const process = (BigInt(id) << 32n) | BigInt(serial);

            expected = { node, id, serial, creation, process };
            pid = Pid.of(node, id, serial, creation);
        });

        describe('node', function () {
            it('is an integer', function () {
                expect(typeof pid.node).toBe('number');
                expect(pid.node).toBe(expected.node);
                expect(Number.isInteger(pid.node)).toBe(true);
            });
        });
        describe('id', function () {
            it('is an integer', function () {
                expect(typeof pid.id).toBe('number');
                expect(pid.id).toBe(expected.id);
                expect(Number.isInteger(pid.id)).toBe(true);
            });
        });
        describe('serial', function () {
            it('is an integer', function () {
                expect(typeof pid.serial).toBe('number');
                expect(pid.serial).toBe(expected.serial);
                expect(Number.isInteger(pid.serial)).toBe(true);
            });
        });
        describe('creation', function () {
            it('is an integer', function () {
                expect(typeof pid.creation).toBe('number');
                expect(pid.creation).toBe(expected.creation);
                expect(Number.isInteger(pid.creation)).toBe(true);
            });
        });
        describe('process', function () {
            it('is a big integer', function () {
                expect(typeof pid.process).toBe('bigint');
                expect(pid.process).toBe(expected.process);
            });
        });
    });
});
