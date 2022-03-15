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
        this._routersById = new Map([['0', this._router]]);
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

    link(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('link(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid) && pidB.node === Pid.LOCAL) {
            this._log('monitor(%o, %o) : local', pidA, pidB);
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._link(watchee);
                watchee._link(pidA);
            } else {
                this.deliver(pidA, t(EXIT, pidB, 'noproc', Error().stack));
            }
            return ok;
        } else if (compare(Pid.isPid)) {
            this._log('monitor(%o, %o) : remote', pidA, pidB);
            const router = this._routersById.get(pidB.node);
            if (router) {
                ctx._link(pidB);
                this.deliver(router.pid, t(link, pidB, pidA));
            } else {
                this.deliver(
                    pidA,
                    t(EXIT, pidB, 'noconnection', Error().stack)
                );
            }
            return ok;
        } else {
            throw new OTPError(t(badarg, pidB));
        }
    }

    unlink(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('unlink(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid) && pidB.node === Pid.LOCAL) {
            this._log('unlink(%o, %o) : local', pidA, pidB);
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._unlink(watchee);
                watchee._unlink(pidA);
            } else {
                this.deliver(pidA, t(EXIT, pidB, 'noproc', Error().stack));
            }
            return ok;
        } else if (compare(Pid.isPid)) {
            this._log('unlink(%o, %o) : remote', pidA, pidB);
            const router = this._routers.get(node);
            if (router) {
                ctx._unlink(pidB);
                this.deliver(router.pid, t(unlink, pidB, pidA));
            } else {
                this.deliver(
                    pidA,
                    t(EXIT, pidB, 'noconnection', Error().stack)
                );
            }
            return ok;
        } else {
            throw new OTPError(t(badarg, pidB));
        }
    }

    monitor(watcherPid, watcheePid, ref) {
        const compare = caseOf(watcheePid);
        ref = ref ? ref : this.ref();

        this._log('monitor(%o, %o)', watcherPid, watcheePid);

        if (compare(Pid.isPid) && watcheePid.node === Pid.LOCAL) {
            this._log('monitor(%o, %o) : local', watcherPid, watcheePid);
            const watchee = this._processes.get(watcheePid.process);
            if (watchee) {
                watchee._monitor(ref, watcherPid);
                this._monitors.set(ref, watchee);
            } else {
                this.deliver(
                    watcherPid,
                    t(DOWN, ref, 'process', watcheePid, 'noproc')
                );
            }
            return ref;
        } else if (compare(Pid.isPid)) {
            this._log('monitor(%o, %o) : remote', watcherPid, watcheePid);
            const router = this._routersById.get(watcheePid.node);
            if (router) {
                this.deliver(
                    router.pid,
                    t(monitor, watcheePid, ref, watcherPid)
                );
            } else {
                this.deliver(
                    watcherPid,
                    t(DOWN, ref, 'process', watcheePid, 'noconnection')
                );
            }
        } else if (compare(t(_, _))) {
            const [name, node] = watcheePid;
            if (node === this.name) {
                return this.monitor(watcherPid, name, ref);
            } else {
                const router = this._routers.get(node);
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
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            watcheePid = this._registrations.get(watcheePid);
            return this.monitor(watcherPid, watcheePid, ref);
        }
    }

    demonitor(ref) {
        if (Ref.isRef(ref)) {
            const watchee = this._monitors.get(ref);
            if (watchee) {
                watchee._demonitor(ref);
                this._monitors.delete(ref);
            }
        } else if (Pid.isPid(ref)) {
            const pid = ref;
            const toRemove = [];
            this._monitors.forEach((target, ref) => {
                if (Pid.compare(target, pid) === 0) {
                    toRemove.push(ref);
                }
            });
            toRemove.forEach((ref) => this.demonitor(ref));
        }
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
            const id = `${this._routerCount++}`;
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
        return Pid.of(Pid.LOCAL, this._processesCount++);
    }

    makeContext() {
        const ctx = new Context(this);
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

    #deliver(to, message) {
        const compare = caseOf(to);
        if (compare(Pid.isPid)) {
            to = new Pid(to);
            if (to.node == Pid.LOCAL) {
                const ctx = this._processes.get(to.process);
                if (ctx && !ctx.dead) {
                    ctx._deliver(message);
                    return ok;
                } else {
                    return ok;
                }
            } else {
                this._log('deliver(%o) : PID : REMOTE', to, to.node);
                const router = this._routersById.get(to.node);
                if (router) {
                    return this.#deliver(router.pid, t(relay, to, message));
                } else {
                    return ok;
                }
            }
        } else if (compare(t(_, _))) {
            const [name, node] = to;
            if (node === this.name) {
                return this.#deliver(name, message);
            } else {
                const router = this._routers.get(node);
                if (router) {
                    return this.#deliver(router.pid, t(relay, name, message));
                } else {
                    return ok;
                }
            }
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            this._log(
                'deliver(%o) : NAME : LOCAL : %O',
                to,
                this._registrations
            );
            to = this._registrations.get(to);
            return this.#deliver(to, message);
        }
    }

    processInfo(pid) {
        const ctx = this._processes.get(new Pid(pid).process);
        if (ctx) {
            return ctx._processInfo();
        } else {
            return undefined;
        }
    }
}
