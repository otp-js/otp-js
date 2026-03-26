/* eslint-env mocha */
import chaiMatching from '@otpjs/matching/chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import * as functions from '#node/functions';
import { Ref, t, OTPError } from '@otpjs/types';
import * as Symbols from '#symbols';

async function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

function randomInt() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

afterEach(function() {
    sinon.restore();
})

describe('@otpjs/node/functions', function() {
    let node;
    let context;
    let logger;
    let installed;
    let pid;
    beforeEach(function() {
        pid = randomInt();
        installed = new Map();
        logger = sinon.stub();
        context = {
            self: sinon.fake(() => pid),
            die: sinon.stub(),
        };
        node = {
            name: 'node',
            logger: sinon.fake(() => logger),
            addFunction: sinon.fake((name, fn) => {
                if (installed.has(name)) {
                    throw new Error(`Function ${name} already installed`);
                }
                installed.set(name, fn);
            }),
            exec: sinon.stub(),
            signal: sinon.stub(),
            makeContext: sinon.fake(() => context),
        };
    });
    describe('refs', function() {
        it('has an install function', function() {
            expect(functions.refs.install).to.be.an.instanceOf(Function);
        });
        it('installs a ref function', function() {
            expect(() => functions.refs.install(node)).not.to.throw();
            expect(node.addFunction).to.have.been.calledWith(
                'ref',
                sinon.match.func
            );
        });
        describe('ref', function() {
            beforeEach(function() {
                functions.refs.install(node);
            });
            it('returns an instance of Ref', function() {
                const ref = installed.get('ref');
                const instance = ref();
                expect(Ref.isRef(instance)).to.equal(true);
            });
            it('is different for each call', function() {
                const ref = installed.get('ref');
                expect(ref()).not.to.matchPattern(ref());
            });
        });
    });
    describe('signals', function() {
        it('has an install function', function() {
            expect(functions.signals.install).to.be.an.instanceOf(Function);
        });
        it('installs several signaling functions', function() {
            expect(() => functions.signals.install(node)).not.to.throw();
            expect(node.addFunction).to.have.been.calledWith(
                'link',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'unlink',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'deliver',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'monitor',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'demonitor',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'exit',
                sinon.match.func
            );
        });
        describe('installs', function() {
            beforeEach(function() {
                functions.signals.install(node);
            });
            describe('link', function() {
                it('emits a link signal to both pids', function() {
                    const link = installed.get('link');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    link(pidA, pidB);
                    expect(node.signal).to.have.been.calledWith(
                        pidA,
                        Symbols.link,
                        pidB
                    );
                    expect(node.signal).to.have.been.calledWith(
                        pidB,
                        Symbols.link,
                        pidA
                    );
                });
            });
            describe('unlink', function() {
                it('emits an unlink signal to both pids', function() {
                    const unlink = installed.get('unlink');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    unlink(pidA, pidB);
                    expect(node.signal).to.have.been.calledWith(
                        pidA,
                        Symbols.unlink,
                        pidB
                    );
                    expect(node.signal).to.have.been.calledWith(
                        pidB,
                        Symbols.unlink,
                        pidA
                    );
                });
            });
            describe('deliver', function() {
                it('emits a deliver signal to the target pid', function() {
                    const deliver = installed.get('deliver');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    deliver(pidA, pidB, 'message');
                    expect(node.signal).to.have.been.calledWith(
                        pidA,
                        Symbols.relay,
                        pidB,
                        'message'
                    );
                });
            });
            describe('monitor', function() {
                describe('when passed a ref', function() {
                    it('returns the same ref', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        expect(monitor(pidA, pidB, ref)).to.equal(ref);
                    });
                });
                describe('when not passed a ref', function() {
                    it('returns a new ref', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        node.exec.returns(
                            Ref.for(Ref.LOCAL, 1, 0, 1)
                        );
                        const ref = monitor(pidA, pidB);
                        expect(Ref.isRef(ref)).to.equal(true);
                    });
                });
                describe('when there is no signaling error', function() {
                    it('emits a monitor signal to the target pid', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        monitor(pidA, pidB, ref);
                        expect(node.signal).to.have.been.calledWith(
                            pidA,
                            Symbols.monitor,
                            pidB,
                            ref
                        );
                    });
                });
                describe('when there is a signaling error', function() {
                    it('emits a DOWN signal to the source pid', function() {
                        const monitor = installed.get('monitor');
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        const pidA = randomInt();
                        const pidB = randomInt();

                        node.signal.returns(
                            t(Symbols.error, 'reason')
                        );

                        monitor(pidA, pidB, ref);
                        expect(node.signal).to.have.been.calledWith(
                            pidA,
                            Symbols.monitor,
                            pidB,
                            ref
                        );
                        expect(node.signal).to.have.been.calledWith(
                            pidB,
                            Symbols.DOWN,
                            pidA,
                            ref,
                            'reason'
                        );
                    });
                });
            });
            describe('demonitor', function() {
                describe('when there is no monitor', function() {
                    it('does not emit a demonitor signal', function() {
                        const demonitor = installed.get('demonitor');
                        demonitor('ref');
                        expect(node.signal).not.to.have.been.called;
                    });
                });
                describe('when there is a monitor', function() {
                    it('emits a demonitor signal to the target pid', async function() {
                        const demonitor = installed.get('demonitor');
                        const monitor = installed.get('monitor');
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        const pidA = randomInt();
                        const pidB = randomInt();
                        monitor(pidA, pidB, ref);
                        sinon.reset();
                        demonitor(pidA, ref);
                        expect(node.signal).to.have.been.calledWith(
                            pidA,
                            Symbols.demonitor,
                            pidB,
                            ref
                        );
                    });
                });
            });
            describe('exit', function() {
                it('emits an exit signal to the target pid', function() {
                    const exit = installed.get('exit');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    exit(pidA, pidB, 'reason');
                    expect(node.signal).to.have.been.calledWith(
                        pidA,
                        Symbols.exit,
                        pidB,
                        'reason'
                    );
                });
            });
        });
    });
    describe('spawn', function() {
        it('has an install function', function() {
            expect(functions.spawn.install).to.be.an.instanceOf(Function);
        });
        it('installs several spawn functions', function() {
            expect(() => functions.spawn.install(node)).not.to.throw();
            expect(node.addFunction).to.have.been.calledWith(
                'spawn',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'spawnLink',
                sinon.match.func
            );
            expect(node.addFunction).to.have.been.calledWith(
                'spawnMonitor',
                sinon.match.func
            );
        });
        describe('installs', function() {
            let spawn;
            let spawnLink;
            let spawnMonitor;

            beforeEach(function() {
                functions.spawn.install(node);
                spawn = installed.get('spawn');
                spawnLink = installed.get('spawnLink');
                spawnMonitor = installed.get('spawnMonitor');
            });

            describe('spawn', function() {
                let go;
                beforeEach(function() {
                    go = sinon.stub();
                });
                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawn(go);
                    expect(node.makeContext).to.have.been.called;
                });
                it('returns the pid of the context', function() {
                    expect(spawn(go)).to.equal(pid);
                });
                it('runs the provided function with the context', async function() {
                    await spawn(go);
                    await wait();
                    expect(go).to.have.been.calledWith(context);
                });
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw OTPError('reason');
                            });
                            spawn(go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw Error('reason');
                            });
                            spawn(go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                t(Symbols.error, 'reason')
                            );
                        });
                    });
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw 'reason';
                            });
                            spawn(go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = sinon.fake(() => Symbols.ok);
                            spawn(go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                Symbols.normal
                            );
                        });
                    });
                });
            });
            describe('spawnLink', function() {
                let go;
                let otherPid;
                beforeEach(function() {
                    otherPid = randomInt();
                    go = sinon.stub();
                });

                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawnLink(otherPid, go);
                    expect(node.makeContext).to.have.been.called;
                });
                it('returns the pid of the context', function() {
                    expect(spawnLink(otherPid, go)).to.equal(pid);
                });
                it('links the pids', function() {
                    spawnLink(otherPid, go);
                    expect(node.exec).to.have.been.calledWith('link', [
                        otherPid,
                        pid,
                    ]);
                });
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw OTPError('reason');
                            });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw Error('reason');
                            });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                t(Symbols.error, 'reason')
                            );
                        });
                    });
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw 'reason';
                            });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = sinon.fake(() => Symbols.ok);
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                Symbols.normal
                            );
                        });
                    });
                });
            });
            describe('spawnMonitor', function() {
                let go;
                let otherPid;
                beforeEach(function() {
                    otherPid = randomInt();
                    go = sinon.stub();
                });

                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawnMonitor(otherPid, go);
                    expect(node.makeContext).to.have.been.called;
                });
                it('returns the pid of the context', function() {
                    const mref = randomInt();
                    node.exec.returns(mref);
                    expect(spawnMonitor(otherPid, go)).to.matchPattern(
                        t(pid, mref)
                    );
                });
                it('links the pids', function() {
                    spawnMonitor(otherPid, go);
                    expect(node.exec).to.have.been.calledWith('monitor', [
                        otherPid,
                        pid,
                    ]);
                });
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw OTPError('reason');
                            });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw Error('reason');
                            });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                t(Symbols.error, 'reason')
                            );
                        });
                    });
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = sinon.fake(() => {
                                throw 'reason';
                            });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith('reason');
                        });
                    });
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = sinon.fake(() => Symbols.ok);
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).to.have.been.calledWith(
                                Symbols.normal
                            );
                        });
                    });
                });
            });
        });
    });
    describe('pids', function() {
        it('has an install function', function() {
            expect(functions.pids.install).to.be.an.instanceOf(Function);
        });
        it('installs a node function', function() {
            expect(() => functions.pids.install(node)).not.to.throw();
            expect(node.addFunction).to.have.been.calledWith(
                'node',
                sinon.match.func
            );
        });
        describe('installs', function() {
            beforeEach(function() {
                functions.pids.install(node);
            });
            describe('node', function() {
                describe('given no arguments', function() {
                    it("returns the current node's name", function() {
                        const getNode = installed.get('node');
                        expect(getNode()).to.equal(node.name);
                    });
                });
                describe('given a pid', function() {
                    it('returns the name of the node the pid comes from', function() {
                        const getNode = installed.get('node');
                        node.exec.returns('other_name');
                        expect(getNode(pid)).to.equal('other_name');
                    });
                    it("uses getRouterName on the pid's node property", function() {
                        const getNode = installed.get('node');
                        const nodeId = randomInt();
                        node.exec.returns('other_name');
                        expect(getNode({ node: nodeId })).to.equal('other_name');
                        expect(node.exec).to.have.been.calledWith(
                            'getRouterName',
                            [nodeId]
                        );
                    });
                });
            });
        });
    });
});
