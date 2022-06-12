import debug from 'debug';
import { Pid, Ref, OTPError, t, l, cons } from '@otpjs/types';
import * as Symbols from './symbols';
import * as matching from '@otpjs/matching';
import { Context } from './context';

const {
    DOWN,
    EXIT,
    badarg,
    demonitor,
    discover,
    error,
    link,
    lost,
    monitor,
    normal,
    ok,
    permanent,
    relay,
    temporary,
    unlink,
} = Symbols;
const { _, spread } = matching.Symbols;

const log = debug('otpjs:core:node');

const isPidFromLocalNode = (v) => Pid.isPid(v) && v.node === Pid.LOCAL;
const monitors = new WeakMap();

function getNodeId() {
    return `otp-${Node.nodes++}`;
}

function isAtom(atom) {
    return typeof atom === 'symbol';
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
    get systemPid() {
        return this._system;
    }
    node() {
        return this.name;
    }
    nodes() {
        return Array.from(this._routers.values())
            .reduce((acc, router) => {
                this._log('nodes() : router : %o', router);
                if (router.pid) {
                    return cons(router.name, acc);
                } else {
                    return acc;
                }
            }, l.nil)
            .reverse();
    }
    exit(fromPid, toPid, reason) {
        this.signal(fromPid, EXIT, toPid, reason);
    }

    getContext(pid) {
        return this._processes.get(pid.process);
    }

    #signal = matching.clauses((route) => {
        route(_, _, isAtom, spread).to((...args) =>
            this.#signalLocalName(...args)
        );
        route(_, _, isPidFromLocalNode, spread).to((...args) =>
            this.#signalLocal(...args)
        );
        route(_, _, Pid.isPid, spread).to((...args) =>
            this.#signalRemote(...args)
        );
        route(_, _, t(_, _), spread).to((...args) =>
            this.#signalRemoteName(...args)
        );

        return 'node.signal';
    });

    signal(...args) {
        try {
            return this.#signal(...args);
        } catch (err) {
            return t(error, err);
        }
    }

    #signalLocal(fromPid, signal, toPid, ...args) {
        const toCtx = this.getContext(toPid);
        this._log(
            '#signalLocal(fromPid: %o, signal: %o, toPid: %o)',
            fromPid,
            signal,
            toPid
        );
        if (toCtx) {
            return toCtx.signal(signal, fromPid, ...args);
        } else {
            return t(error, 'noproc');
        }
    }
    #signalLocalName(fromPid, signal, toProc, ...args) {
        const toPid = this.whereis(toProc);
        if (toPid) {
            this.#signalLocal(fromPid, signal, toPid, ...args);
        } else {
            this.signal(this.systemPid, EXIT, fromPid, badarg);
        }
    }

    #signalRemote(fromPid, signal, toPid, ...args) {
        const nodeId = toPid.node;
        const router = this._routersById.get(nodeId);

        if (router) {
            this.signal(
                fromPid,
                relay,
                router.pid,
                t(relay, t(signal, fromPid, toPid, ...args))
            );
            return ok;
        } else {
            return t(error, 'noconnection');
        }
    }
    #signalRemoteName(fromPid, signal, nameNodePair, ...args) {
        const [toProc, toNode] = nameNodePair;
        const router = this._routers.get(toNode);

        if (router) {
            this.signal(
                fromPid,
                relay,
                router.pid,
                t(relay, t(signal, fromPid, toProc, ...args))
            );
            return ok;
        } else {
            return t(error, 'noconnection');
        }
    }

    link(fromPid, toPid) {
        this.signal(fromPid, link, toPid);
        this.signal(toPid, link, fromPid);
    }
    unlink(fromPid, toPid) {
        this.signal(fromPid, unlink, toPid);
        this.signal(toPid, unlink, fromPid);
    }

    monitor(fromPid, toPid, ref) {
        ref = ref ?? this.ref();
        monitors.set(ref, toPid);
        this.signal(fromPid, monitor, toPid, ref);
        return ref;
    }

    demonitor(fromPid, ref) {
        if (monitors.has(ref)) {
            const toPid = monitors.get(ref);
            this.signal(fromPid, demonitor, toPid, ref);
            return ok;
        } else {
            return ok;
        }
    }

    async system(ctx) {
        this._systemContext = ctx;
        let running = true;
        while (running) {
            const message = await ctx.receive();
            this._log('system(%o)', message);
        }
    }

    register(pid, name) {
        if (!isAtom(name)) {
            throw OTPError(badarg);
        }

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
            this.deliver(
                this.systemPid,
                bridge,
                operation(source, score, name, pid)
            );
            for (let name of names) {
                this.deliver(
                    this.systemPid,
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
        return Ref.for(Ref.LOCAL, this._refCount++, 0, 1);
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

        return t(pid, mref);
    }
    async doSpawn(ctx, fun) {
        this._finalizer.register(ctx, ctx.self());
        try {
            await fun(ctx);
            ctx.die(normal);
        } catch (err) {
            ctx.die(err.term ?? err.message);
        }
    }

    deliver(fromPid, toProc, message) {
        this._log(
            'deliver(fromPid: %o, toProc: %o, message: %o)',
            fromPid,
            toProc,
            message
        );
        return this.signal(fromPid, relay, toProc, message);
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
