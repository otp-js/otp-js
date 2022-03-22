import debug from 'debug';
import { Pid, Ref, OTPError, t } from '@otpjs/types';
import * as Symbols from './symbols';
import * as matching from '@otpjs/matching';
import { Context } from './context';

const {
    DOWN,
    EXIT,
    badarg,
    discover,
    link,
    monitor,
    normal,
    ok,
    relay,
    unlink,
    temporary,
    permanent,
    lost,
} = Symbols;
const { _ } = matching.Symbols;

const log = debug('otpjs:core:node');

const isPidFromLocalNode = (v) => Pid.isPid(v) && v.node === Pid.LOCAL;

function getNodeId() {
    return `otp-${Node.nodes++}`;
}

function getNodeHost() {
    if (typeof window === 'undefined') {
        return '127.0.0.1';
    } else {
        return window.location.hostname;
    }
}

export class Node {
    static nodes = 0;
    static get Context() {
        return Context;
    }
    constructor(id = Symbol.for(`${getNodeId()}@${getNodeHost()}`)) {
        this._id = id;
        this._log = log.extend(this.name.toString());
        this._finalizer = new FinalizationRegistry((pid) => {
            log('finalize(%o)', pid);
            this._processes.delete(pid.process);
            this.unregister(pid);
        });
        this._monitors = new Map();
        this._processes = new Map();
        this._processesCount = 0;

        this._system = this.spawn((ctx) => this.system(ctx));

        this._router = {
            id: 0,
            pid: this._system,
            name: this.name,
            source: null,
            score: 0,
        };
        this._routers = new Map([[this.name, this._router]]);
        this._routersById = new Map([[0, this._router]]);
        this._routersByPid = new Map([[this._system, this._router]]);
        this._bridges = new Map();
        this._routerCount = 1;
        this._refCount = 0;
        this._registrations = new Map();
    }
    get name() {
        return this._id;
    }
    node() {
        return this.name;
    }
    nodes() {
        return Array.from(this._routers.values()).reduce((acc, router) => {
            this._log('nodes() : router : %o', router);
            if (router.pid) {
                return [...acc, router.name];
            } else {
                return acc;
            }
        }, []);
    }
    exit(pid, reason) {
        const message = t(EXIT, reason, Error().stack);
        return this.deliver(pid, message);
    }

    link = matching.clauses((route) => {
        route(isPidFromLocalNode).to(this.#linkLocal);
        route(Pid.isPid).to(this.#linkRemote);
        route(_).to((ctx, pidB) => {
            throw OTPError(t(badarg, pidB));
        });
    });
    #linkLocal(ctx, pidB) {
        const pidA = ctx.self();
        this._log('#linkLocal(%o, %o)', pidA, pidB);
        const watchee = this._processes.get(pidB.process);
        if (watchee) {
            ctx._link(watchee);
            watchee._link(pidA);
        } else {
            this.deliver(pidA, t(EXIT, pidB, 'noproc', Error().stack));
        }
        return ok;
    }
    #linkRemote(ctx, pidB) {
        const pidA = ctx.self();
        this._log('#linkRemote(%o, %o)', pidA, pidB);
        const router = this._routersById.get(pidB.node);
        if (router) {
            ctx._link(pidB);
            this.deliver(router.pid, t(link, pidB, pidA));
        } else {
            this.deliver(pidA, t(EXIT, pidB, 'noconnection', Error().stack));
        }
        return ok;
    }

    unlink = matching.clauses((route) => {
        route(isPidFromLocalNode).to(this.#unlinkLocal);
        route(Pid.isPid).to(this.#unlinkRemote);
        route(_).to(() => {
            throw new OTPError(t(badarg, pidB));
        });
    });
    #unlinkLocal(ctx, pidB) {
        const pidA = ctx.self();
        this._log('#unlinkLocal(%o, %o)', pidA, pidB);
        const watchee = this._processes.get(pidB.process);
        if (watchee) {
            ctx._unlink(watchee);
            watchee._unlink(pidA);
        } else {
            this.deliver(pidA, t(EXIT, pidB, 'noproc', Error().stack));
        }
        return ok;
    }
    #unlinkRemote(ctx, pidB) {
        const pidA = ctx.self();
        this._log('#unlinkRemote(%o, %o)', pidA, pidB);
        const router = this._routers.get(node);
        if (router) {
            ctx._unlink(pidB);
            this.deliver(router.pid, t(unlink, pidB, pidA));
        } else {
            this.deliver(pidA, t(EXIT, pidB, 'noconnection', Error().stack));
        }
        return ok;
    }

    monitor = matching.clauses((route) => {
        route(Pid.isPid, isPidFromLocalNode).to(this.#monitorLocalPid);
        route(Pid.isPid, isPidFromLocalNode, Ref.isRef).to(
            this.#monitorLocalPid
        );
        route(Pid.isPid, Pid.isPid).to(this.#monitorRemotePid);
        route(Pid.isPid, Pid.isPid, Ref.isRef).to(this.#monitorRemotePid);

        route(Pid.isPid, undefined).to(this.#monitorTargetUndefined);
        route(Pid.isPid, undefined, Ref.isRef).to(this.#monitorTargetUndefined);

        route(Pid.isPid, t(_, _)).to(this.#monitorNameNodePair);
        route(Pid.isPid, t(_, _), Ref.isRef).to(this.#monitorNameNodePair);

        route(Pid.isPid, _).to(this.#monitorRegisteredName);
        route(Pid.isPid, _, Ref.isRef).to(this.#monitorRegisteredName);
    });
    #monitorLocalPid(watcherPid, watcheePid, ref) {
        ref = ref ?? this.ref();
        this._log('#monitorLocalPid(%o, %o)', watcherPid, watcheePid);
        const watchee = this._processes.get(watcheePid.process);
        if (watchee) {
            this._log('#monitorLocalPid(watchee: %o, ref: %O)', watchee, ref);
            watchee._monitor(ref, watcherPid);
            this._monitors.set(ref, watchee);
        } else {
            this._log('#monitorLocalPid(DOWN: %o)', watcheePid);
            this.deliver(
                watcherPid,
                t(DOWN, ref, 'process', watcheePid, 'noproc')
            );
        }
        return ref;
    }
    #monitorRemotePid(watcherPid, watcheePid, ref) {
        ref = ref ?? this.ref();
        this._log('monitor(%o, %o) : remote', watcherPid, watcheePid);
        const router = this._routersById.get(watcheePid.node);
        if (router) {
            this.deliver(router.pid, t(monitor, watcheePid, ref, watcherPid));
        } else {
            this.deliver(
                watcherPid,
                t(DOWN, ref, 'process', watcheePid, 'noconnection')
            );
        }
        return ref;
    }
    #monitorNameNodePair(watcherPid, watcheePid, ref) {
        const [name, node] = watcheePid;
        ref = ref ?? this.ref();
        if (node === this.name) {
            this._log('#monitorNameNodePair(localName: %o)', name);
            return this.monitor(watcherPid, name, ref);
        } else {
            const router = this._routers.get(node);
            this._log('#monitorNameNodePair(router: %o)', router);
            if (router) {
                this.deliver(router.pid, t(monitor, name, ref, watcherPid));
            } else {
                this.deliver(
                    watcherPid,
                    t(DOWN, ref, 'process', watcheePid, 'noconnection')
                );
            }
            return ref;
        }
    }
    #monitorTargetUndefined(watcherPid, watcheePid, ref) {
        throw new OTPError(badarg);
    }
    #monitorRegisteredName(watcherPid, watcheePid, ref) {
        watcheePid = this._registrations.get(watcheePid);
        return this.monitor(watcherPid, watcheePid, ref);
    }

    demonitor = matching.clauses((route) => {
        route(Ref.isRef).to(this.#demonitorByRef);
        route(Pid.isPid).to(this.#demonitorByPid);
    });
    #demonitorByRef(ref) {
        const watchee = this._monitors.get(ref);
        if (watchee) {
            watchee._demonitor(ref);
            this._monitors.delete(ref);
        }
    }
    #demonitorByPid(pid) {
        const toRemove = [];
        this._monitors.forEach((target, ref) => {
            if (Pid.compare(target, pid) === 0) {
                toRemove.push(ref);
            }
        });
        toRemove.forEach((ref) => this.demonitor(ref));
    }

    async system(ctx) {
        let running = true;
        while (running) {
            const message = await ctx.receive();
            this._log('system(%o)', message);
        }
    }

    register(pid, name) {
        const proc = this._processes.get(pid.process);
        if (proc) {
            if (this._registrations.has(name)) {
                this._log(
                    'register(%o, %o) : registration.has(name)',
                    pid,
                    name
                );
                throw new OTPError(badarg);
            } else {
                this._registrations.set(name, pid);

                this._log('register(%o, %o)', pid, name);
                proc.death.finally(() => {
                    this.unregister(pid);
                    this.demonitor(pid);
                    this._processes.delete(pid.process);
                });

                return ok;
            }
        } else {
            this._log('register(%o, %o) : proc === undefined', pid, name);
            throw new OTPError(badarg);
        }
    }
    unregister(pid, name = undefined) {
        if (name === undefined) {
            const toUnregister = [];
            this._registrations.forEach((registered, name) => {
                if (Pid.compare(pid, registered) === 0) {
                    toUnregister.push(name);
                }
            });
            toUnregister.forEach((name) => this._registrations.delete(name));
            return ok;
        } else if (
            this._registrations.has(name) &&
            this._registrations.get(name) === pid
        ) {
            this._registrations.delete(name);
            return ok;
        } else {
            return ok;
        }
    }
    whereis(name) {
        if (this._registrations.has(name)) {
            return this._registrations.get(name);
        } else {
            return undefined;
        }
    }

    updatePeers(source, score, name, pid, operation) {
        for (let [bridge, names] of this._bridges) {
            const router = this._routersByPid.get(bridge);
            this.deliver(bridge, operation(source, score, name, pid));
            for (let name of names) {
                this.deliver(
                    pid,
                    operation(router.source, router.score, name, bridge)
                );
            }
        }
    }
    saveBridge(name, pid) {
        let existing = this._bridges.has(pid) ? this._bridges.get(pid) : [];
        let index = existing.indexOf(name);

        if (index >= 0) {
            this._bridges.set(pid, [
                ...existing.slice(0, index),
                name,
                ...existing.slice(index + 1),
            ]);
        } else {
            this._bridges.set(pid, [...existing, name]);
        }
    }
    registerRouter(source, score, name, pid, options = {}) {
        this._log(
            'registerRouter(%o, %o, %o, %o) : this._routers : %o',
            source,
            score,
            name,
            pid,
            this._routers
        );
        if (this._routers.has(name)) {
            const router = this._routers.get(name);
            const { source: oldSource, pid: oldPid, id } = router;

            this._log(
                'registerRouter(%o, %o, %o, %o) : oldPid : %o',
                source,
                score,
                name,
                pid,
                oldPid
            );
            if (
                Pid.compare(pid, oldPid) != 0 && // Make sure it's not an echo of the current router
                (score < router.score || // Ensure it provides better connectivity
                    oldPid === null) // ...unless the last router died
            ) {
                const nextRouter = {
                    source,
                    pid,
                    id,
                    name,
                    score,
                    type: options.type ?? temporary,
                };
                this._routers.set(name, nextRouter);
                this._routersById.set(id, nextRouter);
                this._routersByPid.set(pid, nextRouter);
                if (options.bridge) {
                    this.updatePeers(source, score, name, pid, _discover);
                    this.saveBridge(name, pid);
                }
            }

            return id;
        } else {
            const id = this._routerCount++;
            const router = {
                pid,
                id,
                name,
                source,
                score,
                type: options.type ?? temporary,
            };
            this._routers.set(name, router);
            this._routersById.set(id, router);
            this._routersByPid.set(pid, router);

            if (options.bridge) {
                this.updatePeers(source, score, name, pid, _discover);
                this.saveBridge(name, pid);
            }

            return id;
        }

        function _discover(source, score, name, pid) {
            return t(discover, source, score, name, pid);
        }
    }
    unregisterRouter(pid) {
        this._log('unregisterRouter(%o)', pid);
        if (this._routersByPid.has(pid)) {
            const router = this._routersByPid.get(pid);
            const { id, name, type } = router;

            if (type === permanent) {
                this._routers.set(name, { ...router, pid: null });
                this._routersById.set(id, { ...router, pid: null });
            } else {
                this._routers.delete(name);
                this._routersById.delete(id);
            }
            this._routersByPid.delete(pid);

            if (this._bridges.has(pid)) {
                const names = this._bridges.get(pid);
                this._bridges.delete(pid);

                this._log('unregisterRouter(%o) : names : %o', pid, names);
                for (let name of names) {
                    if (this._routers.has(name)) {
                        const { source, score, pid } = this._routers.get(name);
                        this.unregisterRouter(pid);
                        this.updatePeers(source, score, name, pid, _lost);
                    }
                }
            }
        }

        return ok;

        function _lost(_source, _score, _name, pid) {
            return t(lost, pid);
        }
    }
    getRouterName(id) {
        this._log(
            'getRouterName(%o) : this._routersById : %o',
            id,
            this._routersById
        );
        const router = this._routersById.get(id);

        if (router) {
            return router.name;
        } else {
            throw new OTPError(t('unrecognized_router_id', id));
        }
    }
    getRouterId(name) {
        const router = this._routers.get(name);

        if (router) {
            return router.id;
        } else {
            throw new OTPError(t('unrecognized_router_name', name));
        }
    }

    ref() {
        return Ref.for(Pid.LOCAL, this._refCount++);
    }
    pid() {
        return Pid.of(Pid.LOCAL, this._processesCount++, 0, 1);
    }

    makeContext() {
        const ctx = new Node.Context(this);
        this._processes.set(ctx.self().process, ctx);
        this._log('makeContext() : pid : %o', ctx.self());
        return ctx;
    }
    spawn(fun) {
        const ctx = this.makeContext();
        const pid = ctx.self();

        this.doSpawn(ctx, fun);

        return pid;
    }
    spawnLink(linked, fun) {
        const ctx = this.makeContext();
        const pid = ctx.self();

        this.link(linked, pid);
        this.doSpawn(ctx, fun);

        return pid;
    }
    spawnMonitor(monitoring, fun) {
        const ctx = this.makeContext();
        const pid = ctx.self();

        const mref = this.monitor(monitoring, pid);
        this.doSpawn(ctx, fun);

        return pid;
    }
    async doSpawn(ctx, fun) {
        this._finalizer.register(ctx, ctx.self());
        try {
            await fun(ctx);
            ctx.die(normal);
        } catch (err) {
            ctx.die(err.message);
        }
    }

    deliver(to, message) {
        try {
            this.#deliver(to, message);
            return ok;
        } catch (err) {
            this._log('deliver(%o) : error : %o', err);
            return ok;
        }
    }

    #deliver = matching.clauses((route) => {
        route(isPidFromLocalNode, _).to((...args) =>
            this.#deliverToLocalPid(...args)
        );
        route(Pid.isPid, _).to((...args) => this.#deliverToRemotePid(...args));
        route(
            t(_, (v) => v === this.name),
            _
        ).to(([name, _node], ...args) =>
            this.#deliverToLocalName(name, ...args)
        );
        route(t(_, _), _).to((...args) => {
            this._log('#deliver(args: %o)', args);
            this.#deliverToRemoteName(...args);
        });
        route(undefined, _).to(() => {
            throw new OTPError(badarg);
        });
        route(_, _).to((...args) => this.#deliverToLocalName(...args));
    });
    #deliverToLocalPid(ctx, to, message) {
        const targetCtx = this._processes.get(to.process);
        if (targetCtx && !targetCtx.dead) {
            targetCtx._deliver(message);
            return ok;
        } else {
            return ok;
        }
    }
    #deliverToRemotePid(ctx, to, message) {
        this._log('deliver(%o) : PID : REMOTE', to, to.node);
        const router = this._routersById.get(to.node);
        if (router) {
            return this.#deliver(router.pid, t(relay, to, message));
        } else {
            return ok;
        }
    }
    #deliverToRemoteName(ctx, [name, node], message) {
        const router = this._routers.get(node);
        this._log(
            'deliver(name: %o, node: %o, router: %o)',
            name,
            node,
            router
        );
        if (router) {
            return this.#deliver(
                router.pid,
                t(relay, ctx.self(), name, message)
            );
        } else {
            return ok;
        }
    }
    #deliverToLocalName(to, message) {
        this._log('deliver(%o) : NAME : LOCAL : %O', to, this._registrations);
        to = this._registrations.get(to);
        return this.#deliver(to, message);
    }

    processInfo(pid) {
        const ctx = this._processes.get(pid.process);
        if (ctx) {
            return ctx._processInfo();
        } else {
            return undefined;
        }
    }
}
