import '@otpjs/test_utils';
import * as functions from '../src/node/functions';
import { Ref, t, OTPError } from '@otpjs/types';
import * as Symbols from '../src/symbols';

async function wait(ms = 10) {
    return new Promise(resolve => setTimeout(resolve, 10))
}

function randomInt() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

describe('@otpjs/node/functions', function() {
    let node;
    let context;
    let logger;
    let installed;
    let pid;
    beforeEach(function() {
        pid = randomInt();
        installed = new Map();
        logger = jest.fn();
        context = {
            self: jest.fn(() => pid),
            die: jest.fn(),
        }
        node = {
            name: 'node',
            logger: jest.fn(() => logger),
            addFunction: jest.fn((name, fn) => {
                if (installed.has(name)) {
                    throw new Error(`Function ${name} already installed`);
                }
                installed.set(name, fn);
            }),
            exec: jest.fn(),
            signal: jest.fn(),
            makeContext: jest.fn(() => context)
        }
    });
    describe('refs', function() {
        it('has an install function', function() {
            expect(functions.refs.install).toBeInstanceOf(Function);
        });
        it('installs a ref function', function() {
            expect(() => functions.refs.install(node)).not.toThrow();
            expect(node.addFunction).toHaveBeenCalledWith('ref', expect.any(Function));
        });
        describe('ref', function() {
            beforeEach(function() {
                functions.refs.install(node);
            });
            it('returns an instance of Ref', function() {
                const ref = installed.get('ref');
                const instance = ref();
                expect(Ref.isRef(instance)).toBe(true);
            });
            it('is different for each call', function() {
                const ref = installed.get('ref');
                expect(ref()).not.toMatchPattern(ref());
            });
        });
    });
    describe('signals', function() {
        it('has an install function', function() {
            expect(functions.signals.install).toBeInstanceOf(Function);
        });
        it('installs several signaling functions', function() {
            expect(() => functions.signals.install(node)).not.toThrow();
            expect(node.addFunction).toHaveBeenCalledWith('link', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('unlink', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('deliver', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('monitor', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('demonitor', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('exit', expect.any(Function));
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
                    expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.link, pidB);
                    expect(node.signal).toHaveBeenCalledWith(pidB, Symbols.link, pidA);
                });
            });
            describe('unlink', function() {
                it('emits an unlink signal to both pids', function() {
                    const unlink = installed.get('unlink');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    unlink(pidA, pidB);
                    expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.unlink, pidB);
                    expect(node.signal).toHaveBeenCalledWith(pidB, Symbols.unlink, pidA);
                });
            })
            describe('deliver', function() {
                it('emits a deliver signal to the target pid', function() {
                    const deliver = installed.get('deliver');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    deliver(pidA, pidB, 'message')
                    expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.relay, pidB, 'message');
                });
            })
            describe('monitor', function() {
                describe('when passed a ref', function() {
                    it('returns the same ref', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        expect(monitor(pidA, pidB, ref)).toBe(ref);
                    });
                });
                describe('when not passed a ref', function() {
                    it('returns a new ref', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        node.exec.mockReturnValueOnce(Ref.for(Ref.LOCAL, 1, 0, 1));
                        const ref = monitor(pidA, pidB);
                        expect(Ref.isRef(ref)).toBe(true);
                    });
                });
                describe('when there is no signaling error', function() {
                    it('emits a monitor signal to the target pid', function() {
                        const monitor = installed.get('monitor');
                        const pidA = randomInt();
                        const pidB = randomInt();
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        monitor(pidA, pidB, ref);
                        expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.monitor, pidB, ref);
                    });
                });
                describe('when there is a signaling error', function() {
                    it('emits a DOWN signal to the source pid', function() {
                        const monitor = installed.get('monitor');
                        const ref = Ref.for(Ref.LOCAL, 1, 0, 1);
                        const pidA = randomInt();
                        const pidB = randomInt();

                        node.signal.mockReturnValueOnce(t(Symbols.error, 'reason'));

                        monitor(pidA, pidB, ref);
                        expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.monitor, pidB, ref);
                        expect(node.signal).toHaveBeenCalledWith(pidB, Symbols.DOWN, pidA, ref, 'reason');
                    })
                });
            })
            describe('demonitor', function() {
                describe('when there is no monitor', function() {
                    it('does not emit a demonitor signal', function() {
                        const demonitor = installed.get('demonitor');
                        demonitor('ref');
                        expect(node.signal).not.toHaveBeenCalled();
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
                        jest.clearAllMocks();
                        demonitor(pidA, ref);
                        expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.demonitor, pidB, ref);
                    });
                })
            })
            describe('exit', function() {
                it('emits an exit signal to the target pid', function() {
                    const exit = installed.get('exit');
                    const pidA = randomInt();
                    const pidB = randomInt();
                    exit(pidA, pidB, 'reason');
                    expect(node.signal).toHaveBeenCalledWith(pidA, Symbols.exit, pidB, 'reason');
                });
            })
        });
    });
    describe('spawn', function() {
        it('has an install function', function() {
            expect(functions.spawn.install).toBeInstanceOf(Function);
        });
        it('installs several spawn functions', function() {
            expect(() => functions.spawn.install(node)).not.toThrow();
            expect(node.addFunction).toHaveBeenCalledWith('spawn', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('spawnLink', expect.any(Function));
            expect(node.addFunction).toHaveBeenCalledWith('spawnMonitor', expect.any(Function));
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
                    go = jest.fn();
                });
                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawn(go);
                    expect(node.makeContext).toHaveBeenCalled();
                });
                it('returns the pid of the context', function() {
                    expect(spawn(go)).toBe(pid);
                });
                it('runs the provided function with the context', async function() {
                    await spawn(go);
                    await wait();
                    expect(go).toHaveBeenCalledWith(context);
                });
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = jest.fn(() => { throw OTPError('reason') });
                            spawn(go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = jest.fn(() => { throw Error('reason') });
                            spawn(go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith(t(Symbols.error, 'reason'));
                        })
                    })
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = jest.fn(() => { throw 'reason' });
                            spawn(go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = jest.fn(() => Symbols.ok);
                            spawn(go);
                            await wait()
                            expect(context.die).toHaveBeenCalledWith(Symbols.normal);
                        })
                    })
                });
            });
            describe('spawnLink', function() {
                let go;
                let otherPid;
                beforeEach(function() {
                    otherPid = randomInt();
                    go = jest.fn();
                });

                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawnLink(otherPid, go);
                    expect(node.makeContext).toHaveBeenCalled();
                });
                it('returns the pid of the context', function() {
                    expect(spawnLink(otherPid, go)).toBe(pid);
                });
                it('links the pids', function() {
                    spawnLink(otherPid, go);
                    expect(node.exec).toHaveBeenCalledWith('link', [otherPid, pid]);
                })
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = jest.fn(() => { throw OTPError('reason') });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = jest.fn(() => { throw Error('reason') });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith(t(Symbols.error, 'reason'));
                        })
                    })
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = jest.fn(() => { throw 'reason' });
                            spawnLink(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = jest.fn(() => Symbols.ok);
                            spawnLink(otherPid, go);
                            await wait()
                            expect(context.die).toHaveBeenCalledWith(Symbols.normal);
                        })
                    })
                });
            });
            describe('spawnMonitor', function() {
                let go;
                let otherPid;
                beforeEach(function() {
                    otherPid = randomInt();
                    go = jest.fn();
                });

                it('creates a new context', function() {
                    const spawn = installed.get('spawn');
                    spawnMonitor(otherPid, go);
                    expect(node.makeContext).toHaveBeenCalled();
                });
                it('returns the pid of the context', function() {
                    const mref = randomInt();
                    node.exec.mockReturnValue(mref);
                    expect(spawnMonitor(otherPid, go)).toMatchPattern(t(pid, mref));
                });
                it('links the pids', function() {
                    spawnMonitor(otherPid, go);
                    expect(node.exec).toHaveBeenCalledWith('monitor', [otherPid, pid]);
                })
                describe('when the spawned function', function() {
                    describe('throws an OTP error', function() {
                        it('dies with the embedded term as the reason', async function() {
                            const go = jest.fn(() => { throw OTPError('reason') });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('throws a generic error', function() {
                        it('dies with the embedded message as the reason', async function() {
                            const go = jest.fn(() => { throw Error('reason') });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith(t(Symbols.error, 'reason'));
                        })
                    })
                    describe('throws any other term', function() {
                        it('dies with the term as the reason', async function() {
                            const go = jest.fn(() => { throw 'reason' });
                            spawnMonitor(otherPid, go);
                            await wait();
                            expect(context.die).toHaveBeenCalledWith('reason');
                        })
                    })
                    describe('completes', function() {
                        it('dies with normal as the reason', async function() {
                            const go = jest.fn(() => Symbols.ok);
                            spawnMonitor(otherPid, go);
                            await wait()
                            expect(context.die).toHaveBeenCalledWith(Symbols.normal);
                        })
                    })
                });
            });
        });
    });
    describe('pids', function() {
        it('has an install function', function() {
            expect(functions.pids.install).toBeInstanceOf(Function);
        });
        it('installs a node function', function() {
            expect(() => functions.pids.install(node)).not.toThrow();
            expect(node.addFunction).toHaveBeenCalledWith('node', expect.any(Function));
        });
        describe('installs', function() {
            beforeEach(function() {
                functions.pids.install(node);
            })
            describe('node', function() {
                describe('given no arguments', function() {
                    it('returns the current node\'s name', function() {
                        const getNode = installed.get('node');
                        expect(getNode()).toBe(node.name);
                    });
                });
                describe('given a pid', function() {
                    it('returns the name of the node the pid comes from', function() {
                        const getNode = installed.get('node');
                        node.exec.mockReturnValue('other_name');
                        expect(getNode(pid)).toBe('other_name');
                    });
                    it('uses getRouterName on the pid\'s node property', function() {
                        const getNode = installed.get('node');
                        const nodeId = randomInt();
                        node.exec.mockReturnValue('other_name');
                        expect(getNode({ node: nodeId })).toBe('other_name');
                        expect(node.exec).toHaveBeenCalledWith('getRouterName', [nodeId]);
                    })
                });
            })
        })
    })
});
