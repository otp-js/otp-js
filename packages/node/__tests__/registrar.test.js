/** eslint-env jest */
import '@otpjs/test_utils';
import * as matching from '@otpjs/matching';
import { Pid } from '@otpjs/types';
import * as Symbols from '../src/symbols';
import { Registrar } from '../src/node/registrar.js';
const { ok } = Symbols;

describe('@otpjs/node.Registrar', function () {
    let registrar;
    let node;
    let process_manager;
    let processes;
    let pid_counter;

    function makeFakeProcess() {
        const pid = Pid.of(0, pid_counter++, 0);
        const process = {
            self() {
                return pid;
            },
            death: new Promise(() => true),
        };

        processes.set(pid.toString(), process);
        return process;
    }

    beforeEach(function () {
        processes = new Map();
        pid_counter = 0;
        node = {
            addFunction: jest.fn(),
            logger: jest.fn((scope) => (message) => [scope, message]),
        };
        process_manager = {
            find: jest.fn((pid) => processes.get(pid.toString())),
        };
        registrar = new Registrar(node, process_manager);
    });

    it('adds methods to the node for registration', function () {
        expect(node.addFunction).toHaveBeenCalledWith(
            'register',
            expect.any(Function)
        );
        expect(node.addFunction).toHaveBeenCalledWith(
            'whereis',
            expect.any(Function)
        );
        expect(node.addFunction).toHaveBeenCalledWith(
            'unregister',
            expect.any(Function)
        );
    });

    describe('register', function () {
        it('requires a living process', function () {
            const dead_name = Symbol.for('dead_process');
            const dead = undefined;
            expect(() => registrar.register(dead, dead_name)).toThrow();

            const living_name = Symbol.for('living_process');
            const living = makeFakeProcess();
            expect(() => registrar.register(living, living_name)).toThrow();
        });
        it('requires a symbol for the name', function () {
            const bad_names = [false, 1, '2', 3.0, { 4: 4 }, ['5']];
            const good_names = [Symbol('1'), Symbol.for('2')];
            const process = makeFakeProcess();

            for (let name of bad_names) {
                expect(() =>
                    registrar.register(process.self(), name)
                ).toThrow();
            }
            for (let name of good_names) {
                expect(() =>
                    registrar.register(process.self(), name)
                ).not.toThrow();
            }
        });
        it('fails if the name is already registered', function () {
            const name = Symbol.for('registered_name');
            const first = makeFakeProcess();
            const second = makeFakeProcess();

            expect(() => registrar.register(first.self(), name)).not.toThrow();
            expect(() => registrar.register(second.self(), name)).toThrow();
        });
    });
    describe('whereis', function () {
        describe('with a registered name', function () {
            it('returns the registered process', function () {
                const process = makeFakeProcess();
                const name = Symbol.for('registered_process');

                registrar.register(process.self(), name);
                expect(() => registrar.whereis(name)).not.toThrow();
                expect(registrar.whereis(name)).toBe(process.self());
            });
        });
        describe('with an unregistered name', function () {
            it('returns undefined', function () {
                const name = Symbol.for('unregistered_process');
                expect(() => registrar.whereis(name)).not.toThrow();
                expect(registrar.whereis(name)).toBeUndefined();
            });
        });
    });
    describe('unregister', function () {
        describe('given a registered name', function () {
            it('forgets the registered process and name', function () {
                const name = Symbol.for('registered_process');
                const process = makeFakeProcess();

                registrar.register(process.self(), name);

                expect(registrar.whereis(name)).toBe(process.self());
                expect(() =>
                    registrar.unregister(process.self(), name)
                ).not.toThrow();
                expect(registrar.whereis(name)).toBeUndefined();
            });
        });
        describe('given an unregistered name', function () {
            it('returns ok', function () {
                const name = Symbol.for('registered_process');
                const process = makeFakeProcess();
                expect(registrar.whereis(name)).toBeUndefined();
                expect(() =>
                    registrar.unregister(process.self(), name)
                ).not.toThrow();
                expect(registrar.whereis(name)).toBeUndefined();
            });
        });
        describe('given a pid', function () {
            it('does not affect other pids', function () {
                const name_a = Symbol.for('process_a');
                const process_a = makeFakeProcess();
                const name_b = Symbol.for('process_b');
                const process_b = makeFakeProcess();

                registrar.register(process_a.self(), name_a);
                registrar.register(process_b.self(), name_b);

                expect(() =>
                    registrar.unregister(process_a.self())
                ).not.toThrow();
                expect(registrar.whereis(name_a)).toBeUndefined();
                expect(registrar.whereis(name_b)).toBe(process_b.self());
            });
            describe('with one registered name', function () {
                it('forgets the registered process and name', function () {
                    const name = Symbol.for('registered_process');
                    const process = makeFakeProcess();

                    registrar.register(process.self(), name);

                    expect(registrar.whereis(name)).toBe(process.self());
                    expect(() =>
                        registrar.unregister(process.self())
                    ).not.toThrow();
                    expect(registrar.whereis(name)).toBeUndefined();
                });
            });
            describe('with many registered names', function () {
                it('forgets the registered process and names', function () {
                    const names = [
                        Symbol.for('registered_process_a'),
                        Symbol.for('registered_process_b'),
                        Symbol.for('registered_process_c'),
                    ];
                    const process = makeFakeProcess();

                    for (let name of names) {
                        registrar.register(process.self(), name);
                        expect(registrar.whereis(name)).toBe(process.self());
                    }

                    expect(() =>
                        registrar.unregister(process.self())
                    ).not.toThrow();

                    for (let name of names) {
                        expect(registrar.whereis(name)).toBeUndefined();
                    }

                    expect.assertions(7);
                });
            });
        });
    });
});
