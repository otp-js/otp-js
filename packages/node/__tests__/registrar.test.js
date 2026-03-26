/** eslint-env mocha */
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import { Pid } from '@otpjs/types';
import { Registrar } from '#node/registrar';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

describe('@otpjs/node.Registrar', function() {
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

    beforeEach(function() {
        processes = new Map();
        pid_counter = 0;
        node = {
            addFunction: sinon.stub(),
            logger: sinon.spy((scope) => (message) => [scope, message]),
        };
        process_manager = {
            find: sinon.spy((pid) => processes.get(pid.toString())),
        };
        registrar = new Registrar(node, process_manager);
    });

    it('adds methods to the node for registration', function() {
        expect(node.addFunction).to.have.been.calledWith(
            'register',
            sinon.match.func
        );
        expect(node.addFunction).to.have.been.calledWith(
            'whereis',
            sinon.match.func
        );
        expect(node.addFunction).to.have.been.calledWith(
            'unregister',
            sinon.match.func
        );
    });

    describe('register', function() {
        it('requires a living process', function() {
            const dead_name = Symbol.for('dead_process');
            const dead = undefined;
            expect(() => registrar.register(dead, dead_name)).to.throw();

            const living_name = Symbol.for('living_process');
            const living = makeFakeProcess();
            expect(() => registrar.register(living, living_name)).to.throw();
        });
        it('requires a symbol for the name', function() {
            const bad_names = [false, 1, '2', 3.0, { 4: 4 }, ['5']];
            const good_names = [Symbol('1'), Symbol.for('2')];
            const process = makeFakeProcess();

            for (let name of bad_names) {
                expect(() =>
                    registrar.register(process.self(), name)
                ).to.throw();
            }
            for (let name of good_names) {
                expect(() =>
                    registrar.register(process.self(), name)
                ).not.to.throw();
            }
        });
        it('fails if the name is already registered', function() {
            const name = Symbol.for('registered_name');
            const first = makeFakeProcess();
            const second = makeFakeProcess();

            expect(() => registrar.register(first.self(), name)).not.to.throw();
            expect(() => registrar.register(second.self(), name)).to.throw();
        });
    });
    describe('whereis', function() {
        describe('with a registered name', function() {
            it('returns the registered process', function() {
                const process = makeFakeProcess();
                const name = Symbol.for('registered_process');

                registrar.register(process.self(), name);
                expect(() => registrar.whereis(name)).not.to.throw();
                expect(registrar.whereis(name)).to.equal(process.self());
            });
        });
        describe('with an unregistered name', function() {
            it('returns undefined', function() {
                const name = Symbol.for('unregistered_process');
                expect(() => registrar.whereis(name)).not.to.throw();
                expect(registrar.whereis(name)).to.be.undefined;
            });
        });
    });
    describe('unregister', function() {
        describe('given a registered name', function() {
            it('forgets the registered process and name', function() {
                const name = Symbol.for('registered_process');
                const process = makeFakeProcess();

                registrar.register(process.self(), name);

                expect(registrar.whereis(name)).to.equal(process.self());
                expect(() =>
                    registrar.unregister(process.self(), name)
                ).not.to.throw();
                expect(registrar.whereis(name)).to.be.undefined;
            });
        });
        describe('given an unregistered name', function() {
            it('returns ok', function() {
                const name = Symbol.for('registered_process');
                const process = makeFakeProcess();
                expect(registrar.whereis(name)).to.be.undefined;
                expect(() =>
                    registrar.unregister(process.self(), name)
                ).not.to.throw();
                expect(registrar.whereis(name)).to.be.undefined;
            });
        });
        describe('given a pid', function() {
            it('does not affect other pids', function() {
                const name_a = Symbol.for('process_a');
                const process_a = makeFakeProcess();
                const name_b = Symbol.for('process_b');
                const process_b = makeFakeProcess();

                registrar.register(process_a.self(), name_a);
                registrar.register(process_b.self(), name_b);

                expect(() =>
                    registrar.unregister(process_a.self())
                ).not.to.throw();
                expect(registrar.whereis(name_a)).to.be.undefined;
                expect(registrar.whereis(name_b)).to.equal(process_b.self());
            });
            describe('with one registered name', function() {
                it('forgets the registered process and name', function() {
                    const name = Symbol.for('registered_process');
                    const process = makeFakeProcess();

                    registrar.register(process.self(), name);

                    expect(registrar.whereis(name)).to.equal(process.self());
                    expect(() =>
                        registrar.unregister(process.self())
                    ).not.to.throw();
                    expect(registrar.whereis(name)).to.be.undefined;
                });
            });
            describe('with many registered names', function() {
                it('forgets the registered process and names', function() {
                    const names = [
                        Symbol.for('registered_process_a'),
                        Symbol.for('registered_process_b'),
                        Symbol.for('registered_process_c'),
                    ];
                    const process = makeFakeProcess();

                    for (let name of names) {
                        registrar.register(process.self(), name);
                        expect(registrar.whereis(name)).to.equal(process.self());
                    }

                    expect(() =>
                        registrar.unregister(process.self())
                    ).not.to.throw();

                    for (let name of names) {
                        expect(registrar.whereis(name)).to.be.undefined;
                    }
                });
            });
        });
    });
});
