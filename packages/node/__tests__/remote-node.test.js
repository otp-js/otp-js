/* eslint-env mocha */
import debug from 'debug';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import { error } from '#symbols';
import { t, l, Pid, Ref } from '@otpjs/types';
import { RemoteNode } from '#node/remote';

const log = debug('otpjs:node:tests:routing');

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

const invalid_source = Symbol.for('invalid_source');
const invalid_name = Symbol.for('invalid_name');
const invalid_id = Symbol.for('invalid_id');

let routerCount = 1;
function makeRemoteNode(options = {}) {
    const id = options.id ?? routerCount++;
    const source = options.source ?? Symbol.for('nonode@nohost');
    const pid = options.pid ?? null;
    const name = options.name ?? Symbol.for('remotenode@remotehost');
    const score = options.score ?? 1;
    const bridge = options.bridge ?? false;
    const type = options.type ?? null;
    return new RemoteNode({
        id,
        source,
        pid,
        name,
        score,
        bridge,
        type,
    });
}

function makeRandom() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}


afterEach(function() {
    sinon.restore();
})
describe('@otpjs/node/remote-node', function() {
    describe('an instance', function() {
        it('has an ID attribute', function() {
            const id = makeRandom();
            const node = makeRemoteNode({ id });
            expect(node.id).to.equal(id);
        });

        it('has a source attribute', function() {
            const source = Symbol.for(`node-${makeRandom()}@nohost`);
            const node = makeRemoteNode({ source });
            expect(node.source).to.equal(source);
        });

        it('has a score attribute', function() {
            const score = makeRandom();
            const node = makeRemoteNode({ score });
            expect(node.score).to.equal(score);
        });

        it('has a name attribute', function() {
            const name = Symbol.for(`node-${makeRandom()}@nohost`);
            const node = makeRemoteNode({ name });
            expect(node.name).to.equal(name);
        });

        it('has a type attribute', function() {
            const type = Symbol.for('permanent');
            const node = makeRemoteNode({ type });
            expect(node.type).to.equal(type);
        });

        it('has a bridge attribute', function() {
            const bridge = true;
            const node = makeRemoteNode({ bridge });
            expect(node.bridge).to.equal(bridge);
        });

        it('has a features attribute', function() {
            const bridgeA = true;
            const nodeA = makeRemoteNode({ bridge: bridgeA });
            expect(nodeA.features).to.be.an.instanceOf(Set);
            expect(nodeA.features.has('bridge')).to.equal(true);

            const bridgeB = false;
            const nodeB = makeRemoteNode({ bridge: bridgeB });
            expect(nodeB.features).to.be.an.instanceOf(Set);
            expect(nodeB.features.has('bridge')).to.equal(false);
        });
        it('has a pid attribute', function() {
            const pid = Pid.of(0, makeRandom(), 0);
            const node = makeRemoteNode({ pid });
            expect(node.pid).to.equal(pid);
        });
    });
    describe('when constructed', function() {
        it('requires a valid source attribute', function() {
            expect(
                () =>
                    new RemoteNode({
                        source: Symbol.for('test'),
                        id: 1,
                        name: Symbol.for('test'),
                    })
            ).not.to.throw();
            expect(
                () =>
                    new RemoteNode({
                        source: null,
                        id: 1,
                        name: Symbol.for('test'),
                    })
            ).to.throwTerm(t(error, t(invalid_source, null)));
        });
        it('requires a valid id attribute', function() {
            expect(
                () =>
                    new RemoteNode({
                        source: Symbol.for('test'),
                        id: 1,
                        name: Symbol.for('test'),
                    })
            ).not.to.throw();
            expect(
                () =>
                    new RemoteNode({
                        source: Symbol.for('test'),
                        id: null,
                        name: Symbol.for('test'),
                    })
            ).to.throwTerm(t(error, t(invalid_id, null)));
        });
        it('requires a valid source attribute', function() {
            expect(
                () =>
                    new RemoteNode({
                        source: Symbol.for('test'),
                        id: 1,
                        name: Symbol.for('test'),
                    })
            ).not.to.throw();
            expect(
                () =>
                    new RemoteNode({
                        source: Symbol.for('test'),
                        id: 1,
                        name: null,
                    })
            ).to.throwTerm(t(error, t(invalid_name, null)));
        });
        describe('with bridging enabled', function() {
            let node;
            let signal;
            beforeEach(function() {
                signal = sinon.stub();
                node = new RemoteNode({
                    name: Symbol.for('test.name'),
                    id: 1,
                    source: Symbol.for('test.source'),
                    bridge: true,
                });
            });

            it('can bridge', function() {
                expect(node.can('bridge')).to.equal(true);
                expect(node.bridge).to.equal(true);
            });
        });
    });

    describe('when compared', function() {
        it('prefers one with a non-null pid', function() {
            const nodeA = new RemoteNode({
                pid: null,
                name: Symbol.for('test.name'),
                id: 1,
                source: Symbol.for('test.source'),
            });
            const nodeB = new RemoteNode({
                pid: Pid.of(0, 0, 0),
                name: Symbol.for('test.name'),
                id: 1,
                source: Symbol.for('test.source'),
            });

            expect(RemoteNode.compare(nodeA, nodeB)).to.equal(1);
            expect(RemoteNode.compare(nodeB, nodeA)).to.equal(-1);
        });

        it('considers two with null pids equal', function() {
            const nodeA = makeRemoteNode();
            const nodeB = makeRemoteNode();

            expect(RemoteNode.compare(nodeA, nodeB)).to.equal(0);
        });

        describe('and both have pids', function() {
            describe('that are different', function() {
                it('prefers the one with the lower score', function() {
                    const nodeA = makeRemoteNode({
                        pid: Pid.of(0, 1, 0),
                        score: 1,
                    });
                    const nodeB = makeRemoteNode({
                        pid: Pid.of(0, 2, 0),
                        score: 2,
                    });
                    expect(RemoteNode.compare(nodeA, nodeB)).to.equal(-1);
                    expect(RemoteNode.compare(nodeB, nodeA)).to.equal(1);
                });
            });
            describe('that are the same', function() {
                it('considers them equal', function() {
                    const nodeA = makeRemoteNode({
                        pid: Pid.of(0, 1, 0),
                    });
                    const nodeB = makeRemoteNode({
                        pid: Pid.of(0, 1, 0),
                    });
                    expect(RemoteNode.compare(nodeA, nodeB)).to.equal(0);
                    expect(RemoteNode.compare(nodeB, nodeA)).to.equal(0);
                });
            });
        });
    });
});
