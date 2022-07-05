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

const isLocalPid = (v) => Pid.isPid(v) && v.node === Pid.LOCAL;
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

    #bridges;
    #finalizer;
    #id;
    #living;
    #log;
    #processes;
    #processesCount;
    #refCount;
    #registrations;
    #router;
    #routerCount;
    #routers;
    #routersById;
    #routersByPid;
    #system;
    #systemContext;

    constructor(id = Symbol.for(`${getNodeId()}@${getNodeHost()}`)) {
        this.#id = id;
        this.#living = new Set();
        this.#log = log.extend(this.name.toString());
        this.#finalizer = new FinalizationRegistry((pid) => {
            log('finalize(pid: %o)', pid);
            this.#processes.delete(pid.process);
            this.unregister(pid);
        });
        this.#processes = new Map();
        this.#processesCount = 0;

        this.#system = this.spawn((ctx) => this.system(ctx));

        this.#router = {
            id: 0,
            pid: this.#system,
            name: this.name,
            source: null,
            score: 0,
        };
        this.#routers = new Map([[this.name, this.#router]]);
        this.#routersById = new Map([[0, this.#router]]);
        this.#routersByPid = new Map([[this.#system, this.#router]]);
        this.#bridges = new Map();
        this.#routerCount = 1;
        this.#refCount = 0;
        this.#registrations = new Map();
    }
    get name() {
        return this.#id;
    }
    get systemPid() {
        return this.#system;
    }
    node() {
        return this.name;
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
    exit(fromPid, toPid, reason) {
        this.signal(fromPid, EXIT, toPid, reason);
    }

    getContext(pid) {
        const ref = this.#processes.get(pid.process);

        if (ref) {
            return ref.deref();
        } else {
            return undefined;
        }
    }

    #signal = matching.clauses((route) => {
        route(_, _, isAtom, spread).to(this.#signalLocalName.bind(this));
        route(_, _, isLocalPid, spread).to(this.#signalLocal.bind(this));
        route(_, _, Pid.isPid, spread).to(this.#signalRemote.bind(this));
        route(_, _, t(_, _), spread).to(this.#signalRemoteName.bind(this));
    }, 'node.signal');

    signal(...args) {
        try {
            return this.#signal(...args);
        } catch (err) {
            return t(error, err);
        }
    }

    #signalLocal(fromPid, signal, toPid, ...args) {
        const toCtx = this.getContext(toPid);
        this.#log(
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
        const router = this.#routersById.get(nodeId);

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

        if (toNode === this.name) {
            return this.#signalLocalName(fromPid, signal, toProc, ...args);
        } else {
            const router = this.#routers.get(toNode);

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
        const response = this.signal(fromPid, monitor, toPid, ref);
        const compare = matching.caseOf(response);

        if (compare(t(error, _))) {
            try {
                const [, reason] = response;
                this.#log(
                    '_monitor(toPid: %o, ref: %o, fromPid: %o, error: %o)',
                    toPid,
                    ref,
                    fromPid,
                    reason
                );
                this.signal(toPid, DOWN, fromPid, ref, reason);
            } catch (err) {
                this.#log(
                    '_monitor(self: %o, ref: %o, error: %o)',
                    this.self(),
                    ref,
                    err
                );
            }
        }

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
        this.#systemContext = ctx;
        let running = true;
        while (running) {
            const message = await ctx.receive();
            this.#log('system(message: %o)', message);
        }
    }

    register(pid, name) {
        if (!isAtom(name)) {
            throw OTPError(badarg);
        }

        const ref = this.#processes.get(pid.process);
        if (ref) {
            const proc = ref.deref();
            if (proc) {
                if (this.#registrations.has(name)) {
                    this.#log(
                        'register(pid: %o, name: %o, error: %o)',
                        pid,
                        name,
                        badarg
                    );
                    throw new OTPError(badarg);
                } else {
                    this.#registrations.set(name, pid);
                    this.#log('register(pid: %o, name: %o)', pid, name);
                    proc.death.finally(() => {
                        this.unregister(pid);
                    });

                    return ok;
                }
            } else {
                this.#log('register(%o, %o) : proc === undefined', pid, name);
                throw new OTPError(badarg);
            }
        } else {
            this.#log('register(%o, %o) : ref === undefined', pid, name);
            throw new OTPError(badarg);
        }
    }
    unregister(pid, name = undefined) {
        if (name === undefined) {
            const toUnregister = [];
            this.#registrations.forEach((registered, name) => {
                if (Pid.compare(pid, registered) === 0) {
                    toUnregister.push(name);
                }
            });
            toUnregister.forEach((name) => this.#registrations.delete(name));
            return ok;
        } else if (
            this.#registrations.has(name) &&
            this.#registrations.get(name) === pid
        ) {
            this.#registrations.delete(name);
            return ok;
        } else {
            return ok;
        }
    }
    whereis(name) {
        if (this.#registrations.has(name)) {
            return this.#registrations.get(name);
        } else {
            return undefined;
        }
    }

    updatePeers(source, score, name, pid, operation) {
        for (let [bridge, names] of this.#bridges) {
            const router = this.#routersByPid.get(bridge);
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
        let existing = this.#bridges.has(pid) ? this.#bridges.get(pid) : [];
        let index = existing.indexOf(name);

        if (index >= 0) {
            this.#bridges.set(pid, [
                ...existing.slice(0, index),
                name,
                ...existing.slice(index + 1),
            ]);
        } else {
            this.#bridges.set(pid, [...existing, name]);
        }
    }
    registerRouter(source, score, name, pid, options = {}) {
        this.#log(
            'registerRouter(source: %o, score: %o, name: %o, pid: %o)',
            source,
            score,
            name,
            pid
        );
        if (this.#routers.has(name)) {
            const router = this.#routers.get(name);
            const { source: oldSource, pid: oldPid, id } = router;

            this.#log(
                'registerRouter(source: %o, score: %o, name: %o, oldPid: %o)',
                source,
                score,
                name,
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
                this.#routers.set(name, nextRouter);
                this.#routersById.set(id, nextRouter);
                this.#routersByPid.set(pid, nextRouter);
                if (options.bridge) {
                    this.updatePeers(source, score, name, pid, _discover);
                    this.saveBridge(name, pid);
                }
            }

            return id;
        } else {
            const id = this.#routerCount++;
            const router = {
                pid,
                id,
                name,
                source,
                score,
                type: options.type ?? temporary,
            };
            this.#routers.set(name, router);
            this.#routersById.set(id, router);
            this.#routersByPid.set(pid, router);

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
        this.#log('unregisterRouter(%o)', pid);
        if (this.#routersByPid.has(pid)) {
            const router = this.#routersByPid.get(pid);
            const { id, name, type } = router;

            if (type === permanent) {
                this.#routers.set(name, { ...router, pid: null });
                this.#routersById.set(id, { ...router, pid: null });
            } else {
                this.#routers.delete(name);
                this.#routersById.delete(id);
            }
            this.#routersByPid.delete(pid);

            if (this.#bridges.has(pid)) {
                const names = this.#bridges.get(pid);
                this.#bridges.delete(pid);

                this.#log('unregisterRouter(pid: %o, names: %o)', pid, names);
                for (let name of names) {
                    if (this.#routers.has(name)) {
                        const { source, score, pid } = this.#routers.get(name);
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
        this.#log('getRouterName(id: %o)', id);
        const router = this.#routersById.get(id);

        if (router) {
            return router.name;
        } else {
            throw new OTPError(t('unrecognized_router_id', id));
        }
    }
    getRouterId(name) {
        const router = this.#routers.get(name);

        if (router) {
            return router.id;
        } else {
            throw new OTPError(t('unrecognized_router_name', name));
        }
    }

    ref() {
        return Ref.for(Ref.LOCAL, this.#refCount++, 0, 1);
    }
    pid() {
        return Pid.of(Pid.LOCAL, this.#processesCount++, 0, 1);
    }

    makeContext() {
        const ctx = new Node.Context(this);
        const pid = ctx.self();
        this.#processes.set(pid.process, new WeakRef(ctx));
        this.#living.add(ctx);
        ctx.death.finally(() => this.#living.delete(ctx));
        this.#log('makeContext(pid: %o)', ctx.self());
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
        this.#finalizer.register(ctx, ctx.self());
        try {
            await fun(ctx);
            ctx.die(normal);
        } catch (err) {
            ctx.die(err.term ?? err.message);
        }
    }

    deliver(fromPid, toProc, message) {
        this.#log(
            'deliver(fromPid: %o, toProc: %o, message: %o)',
            fromPid,
            toProc,
            message
        );
        return this.signal(fromPid, relay, toProc, message);
    }

    processInfo(pid) {
        const ref = this.#processes.get(pid.process);
        if (ref) {
            const ctx = ref.deref();
            if (ctx) {
                return ctx._processInfo();
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
    }

    logger(...segments) {
        return this.#log.extend(...segments);
    }
}
