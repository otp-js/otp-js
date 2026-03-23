import { RemoteNode } from './remote-node.js';
import { t, l, cons, Pid, OTPError } from '@otpjs/types';
import { temporary, permanent, ok, discover, lost, nodedown } from '../symbols.js';

function makeLost(router) {
    return t(lost, router.pid);
}

function makeDiscover(router) {
    return t(
        discover,
        router.source,
        router.score,
        router.name,
        router.type,
        router.pid
    );
}

export class Network {
    #log;
    #bridges;
    #monitors;
    #node;
    #router;
    #routerCount;
    #routers;
    #routersById;
    #routersByPid;
    #sourcePid;
    constructor(node) {
        this.#node = node;
        this.#log = node.logger('network');
        this.#router = {
            id: 0,
            pid: node.system,
            name: node.name,
            source: null,
            score: 0,
        };
        this.#routers = new Map([[node.name, this.#router]]);
        this.#routersById = new Map([[0, this.#router]]);
        this.#routersByPid = new Map([[node.system.toString(), this.#router]]);
        this.#bridges = new Map();
        this.#routerCount = 1;
        this.#sourcePid = node.system;
        this.#monitors = new Map();

        node.addFunction('registerRouter', this.register.bind(this));
        node.addFunction('unregisterRouter', this.unregister.bind(this));
        node.addFunction('getRouterName', this.getName.bind(this));
        node.addFunction('getRouterId', this.getId.bind(this));
        node.addFunction('nodes', this.nodes.bind(this));
    }

    findById(id) {
        return this.#routersById.get(id);
    }
    findByName(name) {
        this.#log('findByName(this.#routers: %o)', this.#routers);
        return this.#routers.get(name);
    }
    hasId(id) {
        return this.#routersById.has(id);
    }
    hasName(name) {
        return this.#routers.has(name);
    }

    nodes() {
        return Array.from(this.#routers.values())
            .reduce((acc, router) => {
                this.#log('nodes(router: %o)', router);
                if (router.pid) {
                    return cons(router.name, acc);
                } else {
                    return acc;
                }
            }, l.nil)
            .reverse();
    }

    #updatePeers(router, operation) {
        this.#log(
            '#updatePeers(name: %o, pid: %o, #bridges: %o)',
            router.name,
            router.pid,
            this.#bridges
        );
        for (let [bridge, names] of this.#bridges) {
            bridge = Pid.fromString(bridge);
            const message = operation(router);
            this.#log(
                '#updatePeers(bridge: %o, names: %o, message: %o)',
                bridge,
                names,
                message
            );
            this.#node.exec('deliver', [this.#sourcePid, bridge, message]);
            for (const name of names) {
                const theirRouter = this.#routers.get(name);
                const theirMessage = operation(theirRouter);
                this.#log(
                    '#updatePeers(name: %o, theirRouter: %o, theirMessage: %o)',
                    name,
                    theirRouter,
                    theirMessage
                );
                this.#node.exec('deliver', [this.#sourcePid, bridge, message]);
                this.#node.exec('deliver', [
                    this.#sourcePid,
                    router.pid,
                    theirMessage,
                ]);
            }
        }
    }
    #saveBridge(name, pid) {
        this.#log('#saveBridge(pid: %o, #bridges: %o)', pid, this.#bridges);
        let existing = this.#bridges.has(pid.toString())
            ? this.#bridges.get(pid.toString())
            : [];

        const index = existing.indexOf(name);

        this.#log('#saveBridge(name: %o, existing: %o)', name, existing);

        if (index < 0) {
            existing.push(name);
            this.#bridges.set(pid.toString(), existing);
        }
    }

    findBridges(pid) {
        return this.#bridges.get(pid.toString());
    }

    register(source, score, name, pid, options = {}) {
        this.#log(
            'register(source: %o, score: %o, name: %o, pid: %o, options: %o)',
            source,
            score,
            name,
            pid,
            options
        );

        if (this.hasName(name)) {
            const oldRouter = this.#routers.get(name);
            const id = oldRouter.id;
            const nextRouter = new RemoteNode({
                id,
                source,
                pid,
                name,
                score,
                bridge: options.bridge ?? false,
                type: options.type ?? temporary,
            });

            const delta = RemoteNode.compare(oldRouter, nextRouter);
            this.#log(
                'register.exists(name: %o, id: %o, delta: %o)',
                name,
                id,
                delta
            );
            if (delta > 0) {
                this.#routers.set(name, nextRouter);
                this.#routersById.set(id, nextRouter);
                this.#applyFeatures(nextRouter, oldRouter);
            }

            return id;
        } else {
            const id = this.#routerCount++;
            const nextRouter = new RemoteNode({
                id,
                source,
                pid,
                name,
                score,
                bridge: options.bridge ?? false,
                type: options.type ?? temporary,
            });
            this.#log(
                'register.new(source: %o, score: %o, name: %o, id: %o, pid: %o, type: %o)',
                source,
                score,
                name,
                id,
                pid,
                options.type
            );

            this.#routers.set(name, nextRouter);
            this.#routersById.set(id, nextRouter);
            this.#applyFeatures(nextRouter, null);

            return id;
        }
    }

    #applyFeatures(router, oldRouter) {
        if (router.pid) {
            this.#routersByPid.set(router.pid.toString(), router);
            const canBridge = router.can('bridge');
            this.#log(
                '#applyFeatures(router.pid: %o, canBridge: %o)',
                router.pid,
                canBridge
            );

            if (canBridge) {
                this.#updatePeers(router, makeDiscover);
                this.#saveBridge(router.name, router.pid);
            }
        }

        if (oldRouter?.pid) {
            const oldParent = this.#routers.get(oldRouter.name);
            this.#forgetBridge(oldParent.pid, router.name);
        }
    }

    #forgetBridge(pid, name) {
        this.#log(
            '#forgetBridge(pid: %o, name: %o, bridges: %o)',
            pid,
            name,
            this.#bridges
        );
        const names = this.#bridges.get(pid.toString());
        if (names) {
            const index = names.indexOf(name);
            if (index >= 0) {
                names.splice(index, 1);
            }
        }
    }

    unregister(pid) {
        this.#log(
            'unregister(pid: %o, routers: %o)',
            pid,
            Array.from(this.#routersByPid.keys())
        );

        this.#burnBridges(pid);

        if (this.#routersByPid.has(pid?.toString())) {
            const router = this.#routersByPid.get(pid.toString());

            this.#log('unregister.byPid(pid: %o, router: %o)', pid, router);
            this.#updatePeers(router, makeLost);
            this.#nodedown(router.name);
            this.#detach(router);
            this.#burnBridged(router);

            router.lost();

            // If it's a permanent type, be sure to retain it. This ensures
            // that it receives the same ID if and when it reconnects.
            if (router.type === permanent) {
                this.#routers.set(router.name, router);
                this.#routersById.set(router.id, router);
            }
        }

        return ok;
    }

    #nodedown(name, monitors) {
        if (!monitors) monitors = this.#monitorsFor(name);
        for (const monitor of monitors) {
            this.#node.exec('deliver', [
                this.#sourcePid,
                monitor,
                t(nodedown, name),
            ]);
        }
        this.#monitors.delete(name);
    }
    #detach(router) {
        this.#routersByPid.delete(router.pid.toString());
        this.#log('#detach(router: %o, type: %o)', router.name, router.type);
        if (router.type !== permanent) {
            this.#log('#detach.temporary()');
            this.#routers.delete(router.name);
        }
        router.lost();
    }
    #burnBridged(burned) {
        this.#log('#burnBridged(burned: %o)', burned.name);
        for (const router of this.#routers.values()) {
            this.#log(
                '#burnBridged(router.name: %o, router.source: %o, router.pid: %o)',
                router.name,
                router.source,
                router.pid
            );
            if (router.source === burned.name && router.pid) {
                this.unregister(router.pid);
            }
        }
    }
    #burnBridges(pid) {
        if (this.#bridges.has(pid?.toString())) {
            const names = this.#bridges.get(pid.toString());
            this.#bridges.delete(pid.toString());

            for (const name of names) {
                this.#log(
                    '#burnBridges(pid: %o, bridged: %o, router: %o)',
                    pid,
                    name,
                    this.#routers.get(name)
                );
                this.#forget(name);
            }
        }
    }
    #forget(name) {
        if (this.hasName(name)) {
            this.#routers.delete(name);
        }
    }

    getName(id) {
        const router = this.#routersById.get(id);
        this.#log('getName(id: %o, router: %o)', id, router);
        if (router) {
            return router.name;
        } else {
            throw OTPError(t('unrecognized_router_id', id));
        }
    }
    getId(name) {
        const router = this.#routers.get(name);
        this.#log(
            'getId(name: %o, router: %o, #routers: %o',
            name,
            router,
            this.#routers
        );
        if (router) {
            return router.id;
        } else {
            this.register(this.#node.name, Infinity, name, null, {
                type: temporary,
            });
            return this.getId(name);
        }
    }
    /**
     * @method #monitorsFor
     * @private
     * @param {Symbol} node
     * @returns {Pid[]}
     */
    #monitorsFor(node) {
        if (this.#monitors.has(node)) {
            return this.#monitors.get(node);
        } else {
            const monitors = [];
            this.#monitors.set(node, monitors);
            return monitors;
        }
    }
    monitor(monitor, node) {
        if (this.#routers.has(node)) {
            const monitors = this.#monitorsFor(node);
            monitors.push(monitor);
        } else {
            // TODO: attempt connecting to `node`?
            // For now, just trigger the `{nodedown, Node}` signal
            this.#nodedown(node, [monitor]);
        }
    }
    demonitor(monitor, node) {
        if (this.#routers.has(node)) {
            const monitors = this.#monitorsFor(node);
            const index = monitors.findIndex(
                (pid) => Pid.compare(pid, monitor) === 0
            );

            if (index >= 0) {
                monitors.splice(index, 1);
            }
        }
    }
}
