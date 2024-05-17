/* eslint-env jest */
import debug from 'debug';
import '@otpjs/test_utils';
import * as matching from '@otpjs/matching';
import { t, l, Pid, Ref } from '@otpjs/types';
import {
    permanent,
    temporary,
    ok,
    discover,
    lost,
    nodedown,
} from '../src/symbols';
import { Network } from '../src/node/network.js';
import * as util from 'node:util';

const log = debug('otpjs:node:tests:routing');

function makeContext(id) {
    const pid = Pid.of(Pid.LOCAL, 0, id, 1);
    return {
        self: jest.fn(() => pid),
    };
}
function randomInt() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
let count = 0;
function nextInt() {
    return count++;
}
function makeRouter(
    source,
    router,
    ctx = null,
    options = {
        bridge: true,
        type: permanent,
    }
) {
    const { score = 1, suffix = nextInt(), ...forwardOptions } = options;
    const name = Symbol.for(`test-${suffix}@local.node`);
    const id = router.register(
        source,
        score,
        name,
        ctx?.self(),
        forwardOptions
    );
    return { name, ctx, id };
}
function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@otpjs/node/network', function () {
    let node;
    let contexts;
    let network;

    function initializePresetEnvironment() {
        contexts = 1;
        node = {
            logger: jest.fn((segment) => log.extend(segment)),
            system: Pid.of(Pid.LOCAL, 0, 0, 0),
            name: Symbol.for('host@local.node'),
            makeContext: jest.fn(() => makeContext(contexts++)),
            addFunction: jest.fn(),
            exec: jest.fn((name, args) =>
                log('exec(name: %o, args: %o)', name, args)
            ),
        };
        network = new Network(node);
    }

    beforeEach(function () {
        initializePresetEnvironment();
    });
    describe('getName', function () {
        describe('given a registered router id', function () {
            let routerCtx;
            let routerName;
            let routerId;

            beforeEach(function () {
                routerCtx = node.makeContext();
                routerName = Symbol.for('test@local.node');
                routerId = network.register(
                    node.name,
                    1,
                    routerName,
                    routerCtx.self()
                );
            });

            it('returns the router name', function () {
                expect(network.getName(0)).toBe(node.name);
                expect(network.getName(routerId)).toBe(routerName);
            });
        });
        describe('given a non-registered router id', function () {
            let routerId;

            beforeEach(function () {
                routerId = 999;
            });

            it('throws an error', function () {
                expect(function () {
                    network.getName(routerId);
                }).toThrowTerm(t('unrecognized_router_id', routerId));
            });
        });
    });
    describe('getId', function () {
        describe('given a registered router name', function () {
            let routerCtx;
            let routerName;
            let routerId;

            beforeEach(function () {
                routerCtx = node.makeContext();
                routerName = Symbol.for('test@local.node');
                routerId = network.register(
                    node.name,
                    1,
                    routerName,
                    routerCtx.self()
                );
            });

            it('returns the router id', function () {
                expect(network.getId(node.name)).toBe(0);
                expect(network.getId(routerName)).toBe(routerId);
            });
        });
        describe('given a non-registered router name', function () {
            let routerName;

            beforeEach(function () {
                routerName = Symbol.for('test@local.node');
            });

            it('generates a router id for the given name', function () {
                let routerId;

                expect(function () {
                    routerId = network.getId(routerName);
                }).not.toThrow();

                expect(routerId).toBeGreaterThan(0);
                expect(Number.isFinite(routerId)).toBe(true);
                expect(Number.isInteger(routerId)).toBe(true);
            });
        });
    });
    describe('register', function () {
        let routerCtx;
        let routerName;
        let routerId;

        beforeEach(function () {
            routerCtx = node.makeContext();
            routerName = Symbol.for('test@local.node');
        });

        describe('when the given name is not registered', function () {
            it('adds the node name to the nodes list', function () {
                expect(network.nodes()).not.toContain(routerName);
                routerId = network.register(
                    node.name,
                    1,
                    routerName,
                    routerCtx.self()
                );
                expect(network.nodes()).toContain(routerName);
            });
        });

        describe('when the given name is already registered', function () {
            let routerName;
            let routerCtxA;
            let routerCtxB;
            let routerId;

            beforeEach(function () {
                routerName = Symbol.for('test@local.node');
                routerCtxA = node.makeContext();
                routerCtxB = node.makeContext();
                routerId = network.register(
                    node.name,
                    1,
                    routerName,
                    routerCtxA.self(),
                    { type: permanent }
                );
            });

            describe('when the registered router is active', function () {
                describe('when the new routers score', function () {
                    describe('is higher or equal', function () {
                        it('ignores the new router', async function () {
                            const oldRouter = network.findById(routerId);
                            routerId = network.register(
                                node.name,
                                1,
                                routerName,
                                routerCtxB.self()
                            );
                            expect(network.findById(routerId)).toBe(oldRouter);
                        });
                    });
                    describe('is lower', function () {
                        it('replaces the old router', async function () {
                            const oldRouter = network.findById(routerId);
                            routerId = network.register(
                                node.name,
                                0,
                                routerName,
                                routerCtxB.self()
                            );
                            expect(network.findById(routerId)).not.toBe(
                                oldRouter
                            );
                        });

                        describe('when the router is bridged', function () {
                            let routerNameB;
                            let routerCtxC;

                            beforeEach(function () {
                                routerCtxC = node.makeContext();
                                routerNameB = Symbol.for('test@b.local.node');
                                network.register(
                                    node.name,
                                    0,
                                    routerNameB,
                                    routerCtxB.self(),
                                    { type: permanent, bridge: true }
                                );
                            });
                            it('notifies other routers of the new router', async function () {
                                expect(
                                    network.register(
                                        routerNameB,
                                        0,
                                        routerName,
                                        routerCtxC.self(),
                                        { bridge: true, type: permanent }
                                    )
                                ).toBe(routerId);
                                await wait();
                                expect(node.exec).toHaveBeenCalledTimes(2);
                                expect(node.exec.mock.calls[1]).toMatchPattern([
                                    'deliver',
                                    [
                                        node.system,
                                        routerCtxB.self(),
                                        t(
                                            discover,
                                            routerNameB,
                                            0,
                                            routerName,
                                            permanent,
                                            routerCtxC.self()
                                        ),
                                    ],
                                ]);
                            });
                            describe('and the source has changed', function () {
                                beforeEach(function () {
                                    initializePresetEnvironment();
                                });
                                it('remains if the old bridge dies', function () {
                                    const bridgeRouter = makeRouter(
                                        node.name,
                                        network,
                                        node.makeContext(),
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 2,
                                            suffix: 'bridge',
                                        }
                                    );
                                    const alternateBridge = makeRouter(
                                        node.name,
                                        network,
                                        node.makeContext(),
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 1,
                                            suffix: 'alternate',
                                        }
                                    );
                                    const bridgedRouter = makeRouter(
                                        bridgeRouter.name,
                                        network,
                                        node.makeContext(),
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 5,
                                            suffix: 'bridged',
                                        }
                                    );
                                    expect(
                                        network.findByName(bridgedRouter.name)
                                            .source
                                    ).toBe(bridgeRouter.name);

                                    const alternateCtx = node.makeContext();
                                    network.register(
                                        alternateBridge.name,
                                        2,
                                        bridgedRouter.name,
                                        alternateCtx.self(),
                                        { type: permanent, score: 2 }
                                    );

                                    expect(
                                        network.findByName(bridgedRouter.name)
                                            .source
                                    ).toBe(alternateBridge.name);

                                    network.unregister(bridgeRouter.ctx.self());

                                    expect(
                                        network.findByName(bridgedRouter.name)
                                            .source
                                    ).toBe(alternateBridge.name);
                                    expect(
                                        network.findByName(bridgedRouter.name)
                                            .pid
                                    ).toMatchPattern(alternateCtx.self());
                                });

                                it('dissassociates chained bridges', function () {
                                    const home = makeRouter(
                                        node.name,
                                        network,
                                        node.makeContext(),
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 1,
                                            suffix: 'home',
                                        }
                                    );
                                    const firstBridge = makeRouter(
                                        home.name,
                                        network,
                                        home.ctx,
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 2,
                                            suffix: 'first',
                                        }
                                    );
                                    const secondBridge = makeRouter(
                                        firstBridge.name,
                                        network,
                                        home.ctx,
                                        {
                                            bridge: true,
                                            type: permanent,
                                            score: 3,
                                            suffix: 'second',
                                        }
                                    );

                                    expect(
                                        network.findBridges(home.ctx.self())
                                    ).toContain(firstBridge.name);
                                    expect(
                                        network.findBridges(home.ctx.self())
                                    ).toContain(secondBridge.name);
                                });
                            });
                        });
                    });
                });
            });

            describe('when the registered router is inactive', function () {
                beforeEach(async function () {
                    network.unregister(routerCtxA.self());
                });

                it('replaces the old router', async function () {
                    const oldRouter = network.findById(routerId);
                    network.register(
                        node.name,
                        1,
                        routerName,
                        routerCtxB.self()
                    );
                    await expect(network.findById(routerId)).not.toBe(
                        oldRouter
                    );
                });
            });
        });

        describe('when the router is bridged', function () {
            let routerCtx;
            let routerName;
            let routerId;

            beforeEach(function () {
                routerName = Symbol.for('test@a.local.node');
                routerCtx = node.makeContext();
                routerId = network.register(
                    node.name,
                    1,
                    routerName,
                    routerCtx.self(),
                    { bridge: true, type: permanent }
                );
            });

            it('is notified of other node discoveries', async function () {
                const routerNameB = Symbol.for('test@b.local.node');
                const routerCtxB = node.makeContext();
                const routerIdB = network.register(
                    node.name,
                    1,
                    routerNameB,
                    routerCtxB.self(),
                    { bridge: true, type: permanent }
                );

                expect(routerIdB).not.toBe(routerId);
                expect(node.exec).toHaveBeenCalledWithPattern('deliver', [
                    node.system,
                    routerCtx.self(),
                    t(
                        discover,
                        node.name,
                        1,
                        routerNameB,
                        permanent,
                        routerCtxB.self()
                    ),
                ]);
            });
        });
    });
    describe('unregister', function () {
        describe('when given a pid', function () {
            describe('to an active router', function () {
                let routerA;
                let routerName;
                let routerCtx;
                let routerId;

                beforeEach(function () {
                    routerCtx = node.makeContext();
                    routerA = makeRouter(node.name, network, routerCtx, {
                        suffix: 'a',
                        type: permanent,
                    });
                    routerName = routerA.name;
                    routerId = routerA.id;
                });

                describe('which is permanent', function () {
                    it('removes the router', async function () {
                        network.unregister(routerCtx.self());
                        expect(network.findById(routerId).pid).toBe(null);
                    });
                    it('removes the router from the nodes list', function () {
                        expect(network.nodes()).toContain(routerName);
                        expect(network.unregister(routerCtx.self())).toBe(ok);
                        expect(network.nodes()).not.toContain(routerName);
                    });
                    it('still remembers the id', function () {
                        expect(network.getId(routerName)).toBe(routerId);
                        expect(network.unregister(routerCtx.self())).toBe(ok);
                        expect(network.getId(routerName)).toBe(routerId);
                    });
                });
                describe('which is temporary', function () {
                    beforeEach(function () {
                        network.unregister(routerCtx.self());
                        routerId = network.register(
                            node.name,
                            1,
                            routerName,
                            routerCtx.self(),
                            { bridge: true, type: temporary }
                        );
                    });

                    it('forgets the router', async function () {
                        network.unregister(routerCtx.self());
                        expect(network.findById(routerId).pid).toBe(null);
                    });
                    it('removes the router from the nodes list', function () {
                        expect(network.nodes()).toContain(routerName);
                        expect(network.unregister(routerCtx.self())).toBe(ok);
                        expect(network.nodes()).not.toContain(routerName);
                    });
                    it('assigns a new id', function () {
                        expect(network.getId(routerName)).toBe(routerId);
                        expect(network.unregister(routerCtx.self())).toBe(ok);
                        expect(network.getId(routerName)).not.toBe(routerId);
                        expect(typeof network.getId(routerName)).toBe('number');
                    });
                });
                describe('bridging for another node', function () {
                    let routerCtxB;
                    let routerNameB;

                    beforeEach(function () {
                        routerCtxB = node.makeContext();
                        routerNameB = Symbol.for('test@b.local.node');

                        network.register(
                            routerName,
                            2,
                            routerNameB,
                            routerCtxB.self(),
                            { bridge: true, type: permanent }
                        );
                    });

                    it('removes the bridged node from the nodes list', function () {
                        expect(network.nodes()).toContain(routerNameB);
                        network.unregister(routerCtx.self());
                        expect(network.nodes()).not.toContain(routerNameB);
                    });

                    it('notifies other routers', async function () {
                        const routerCtxC = node.makeContext();
                        const routerNameC = Symbol.for('test@c.local.node');

                        network.register(
                            node.name,
                            1,
                            routerNameC,
                            routerCtxC.self(),
                            { bridge: true, type: permanent }
                        );

                        expect(node.exec).toHaveBeenCalledWithPattern(
                            'deliver',
                            [
                                node.system,
                                routerCtxB.self(),
                                t(
                                    discover,
                                    node.name,
                                    1,
                                    routerNameC,
                                    permanent,
                                    routerCtxC.self()
                                ),
                            ]
                        );

                        log(routerCtxC, 'unregisterRouter()');
                        jest.clearAllMocks();
                        network.unregister(routerCtx.self());

                        expect(node.exec).toHaveBeenCalledWithPattern(
                            'deliver',
                            [
                                node.system,
                                routerCtxC.self(),
                                t(lost, routerCtxB.self()),
                            ]
                        );
                    });
                });
                describe('bridging multiple nodes', function () {
                    //beforeEach(initializePresetEnvironment);
                    it('removes all the bridged nodes from the nodes list', function () {
                        const routerB = makeRouter(
                            routerName,
                            network,
                            node.makeContext(),
                            { suffix: 'b' }
                        );
                        const routerC = makeRouter(
                            routerName,
                            network,
                            node.makeContext(),
                            { suffix: 'c' }
                        );

                        const routerD = makeRouter(
                            node.name,
                            network,
                            node.makeContext(),
                            {
                                suffix: 'd',
                            }
                        );
                        const routerE = makeRouter(
                            routerD.name,
                            network,
                            node.makeContext(),
                            { suffix: 'e' }
                        );

                        const nodesBeforeUnregister = Array.from(
                            network.nodes()
                        );
                        log('nodesBeforeUnregister: %o', nodesBeforeUnregister);
                        expect(nodesBeforeUnregister).toContain(routerB.name);
                        expect(nodesBeforeUnregister).toContain(routerC.name);
                        expect(nodesBeforeUnregister).toContain(routerD.name);
                        expect(nodesBeforeUnregister).toContain(routerE.name);

                        network.unregister(routerCtx.self());

                        const nodesAfterUnregister = Array.from(
                            network.nodes()
                        );
                        log('nodesAfterUnregister: %o', nodesAfterUnregister);
                        expect(nodesAfterUnregister).not.toContain(
                            routerB.name
                        );
                        expect(nodesAfterUnregister).not.toContain(
                            routerC.name
                        );
                        expect(nodesAfterUnregister).toContain(routerD.name);
                        expect(nodesAfterUnregister).toContain(routerE.name);
                    });

                    it('removes chained bridges', function () {
                        const home = makeRouter(
                            node.name,
                            network,
                            node.makeContext(),
                            {
                                bridge: true,
                                type: permanent,
                                suffix: 'home',
                            }
                        );
                        const firstBridge = makeRouter(
                            home.name,
                            network,
                            node.makeContext(),
                            { bridge: true, type: permanent, suffix: 'first' }
                        );
                        const secondBridge = makeRouter(
                            firstBridge.name,
                            network,
                            node.makeContext(),
                            { bridge: true, type: permanent, suffix: 'second' }
                        );

                        network.unregister(home.ctx.self());

                        expect(network.findById(home.id).pid).toBe(null);
                        expect(network.findById(firstBridge.id).pid).toBe(null);
                        expect(network.findById(secondBridge.id).pid).toBe(
                            null
                        );
                    });
                });
                describe('which is being monitored', function () {
                    it('notifies the monitor', async function () {
                        const ctx = node.makeContext();
                        network.monitor(ctx.self(), routerName);
                        network.unregister(routerCtx.self());

                        expect(node.exec).toHaveBeenCalledWithPattern(
                            'deliver',
                            [
                                node.system,
                                ctx.self(),
                                t(nodedown, routerCtx.self()),
                            ]
                        );
                    });
                });
            });
        });
    });
    describe('hasId', function () {
        describe('when given an id', function () {
            describe('for a registered router', function () {
                it('returns true', function () {
                    const name = Symbol.for('test.local.node');
                    const ctx = node.makeContext();
                    const id = network.register(
                        node.name,
                        1,
                        name,
                        ctx.self(),
                        {
                            bridge: true,
                            type: permanent,
                        }
                    );
                    expect(network.hasId(id)).toBe(true);
                });
            });
            describe('for a non-registered router', function () {
                it('returns false', function () {
                    expect(network.hasId(1)).toBe(false);
                });
            });
        });
    });
    describe('findByName', function () {
        describe('when given a name', function () {
            describe('that is not registered', function () {
                it('returns undefined', function () {
                    expect(
                        network.findByName(Symbol.for('test.local.node'))
                    ).toBe(undefined);
                });
            });
            describe('that is registered', function () {
                it('returns the router', function () {
                    const name = Symbol.for('test.local.node');
                    const ctx = node.makeContext();
                    const id = network.register(
                        node.name,
                        1,
                        name,
                        ctx.self(),
                        {
                            bridge: true,
                            type: permanent,
                        }
                    );
                    expect(network.findByName(name)).toBe(network.findById(id));
                });
            });
        });
    });
    describe('nodes', function () {
        it('returns the list of node names', function () {
            const nodeA = makeRouter(node.name, network, node.makeContext());
            const nodeB = makeRouter(node.name, network, node.makeContext());
            const nodeC = makeRouter(node.name, network, node.makeContext());

            expect(network.nodes()).toMatchPattern(
                l(node.name, nodeA.name, nodeB.name, nodeC.name)
            );
        });

        it('ignores disconnected routers', function () {
            const nodeA = makeRouter(node.name, network, node.makeContext());
            const nodeB = makeRouter(node.name, network, null);
            const nodeC = makeRouter(node.name, network, node.makeContext());

            expect(network.nodes()).toMatchPattern(
                l(node.name, nodeA.name, nodeC.name)
            );
        });
    });
    describe('monitor', function () {
        describe('when given a name', function () {
            describe('that is not registered', function () {
                it('notifies the monitor', async function () {
                    const ctx = node.makeContext();
                    const routerName = Symbol.for('test.local.node');
                    network.monitor(ctx.self(), routerName);
                    expect(node.exec).toHaveBeenCalledWithPattern('deliver', [
                        node.system,
                        ctx.self(),
                        t(nodedown, routerName),
                    ]);
                });
            });
        });
    });
});
