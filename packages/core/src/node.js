import debug from 'debug';
import { Pid, Ref } from './types.js';
import { Context } from './context.js';
import { ok, _, discover, normal, badarg, monitor, DOWN, EXIT, relay, link, unlink } from './symbols';
import { OTPError } from './error';
import { caseOf } from './matching';

const log = debug('otpjs:core:node');

export class Node {
    static nodes = 0;
    constructor(id = Symbol.for(`otp-${Node.nodes++}@127.0.0.1`)) {
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
        }
        this._routers = new Map([
            [this.name, this._router]
        ]);
        this._routersById = new Map([
            ['0', this._router]
        ]);
        this._routersByPid = new Map([
            [this._system, this._router]
        ]);
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
        return Array.from(this._routers.values()).reduce(
            (acc, router) => {
                this._log('nodes() : router : %o', router);
                if (router.pid) {
                    return [...acc, router.name];
                } else {
                    return acc;
                }
            },
            []
        );
    }

    exit(pid, reason) {
        const message = [EXIT, reason, Error().stack];
        return this.deliver(pid, message);
    }

    link(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('monitor(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid) && pidB.node === Pid.LOCAL) {
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._link(watchee);
                watchee._link(pidA);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noproc',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else if (compare(Pid.isPid)) {
            const router = this._routers.get(node)
            if (router) {
                this.deliver(router.pid, [link, pidB, pidA]);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noconnection',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else {
            throw new OTPError([badarg, pidB]);
        }
    }

    link(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('monitor(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid) && pidB.node === Pid.LOCAL) {
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._link(watchee);
                watchee._link(pidA);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noproc',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else if (compare(Pid.isPid)) {
            const router = this._routers.get(node)
            if (router) {
                ctx._link(pidB);
                this.deliver(router.pid, [link, pidB, pidA]);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noconnection',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else {
            throw new OTPError([badarg, pidB]);
        }
    }

    unlink(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('monitor(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid) && pidB.node === Pid.LOCAL) {
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._unlink(watchee);
                watchee._unlink(pidA);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noproc',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else if (compare(Pid.isPid)) {
            const router = this._routers.get(node)
            if (router) {
                ctx._unlink(pidB);
                this.deliver(router.pid, [unlink, pidB, pidA]);
            } else {
                this.deliver(
                    pidA,
                    [
                        EXIT,
                        pidB,
                        'noconnection',
                        Error().stack
                    ]
                );
            }
            return ok;
        } else {
            throw new OTPError([badarg, pidB]);
        }
    }

    monitor(watcherPid, watcheePid, ref) {
        const compare = caseOf(watcheePid);
        ref = ref ? ref : this.ref();

        this._log('monitor(%o, %o)', watcherPid, watcheePid);

        if (compare(Pid.isPid)) {
            const watchee = this._processes.get(watcheePid.process);
            if (watchee) {
                watchee._monitor(ref, watcherPid);
                this._monitors.set(ref, watchee);
            } else {
                this.deliver(
                    watcherPid,
                    [
                        DOWN,
                        ref,
                        'process',
                        watcheePid,
                        'noproc'
                    ]
                );
            }
            return ref;
        } else if (compare([_, _])) {
            const [name, node] = watcheePid;
            const router = this._routers.get(node)
            if (router) {
                this.deliver(router.pid, [monitor, name, ref, watcherPid]);
            } else {
                this.deliver(
                    watcherPid,
                    [
                        DOWN,
                        ref,
                        'process',
                        watcheePid,
                        'noconnection'
                    ]
                );
            }
            return ref;
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
            this._monitors.forEach(
                (target, ref) => {
                    if (Pid.compare(target, pid) === 0) {
                        toRemove.push(ref);
                    }
                }
            )
            toRemove.forEach(ref => this.demonitor(ref));
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
                this._log('register(%o, %o) : registration.has(name)', pid, name);
                throw new OTPError(badarg);
            } else {
                this._registrations.set(name, pid);

                this._log('register(%o, %o)', pid, name);
                proc.death.finally(
                    () => {
                        this.unregister(pid);
                        this.demonitor(pid);
                        this._processes.delete(pid.process);
                    }
                );

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
            this._registrations.forEach(
                (registered, name) => {
                    if (Pid.compare(pid, registered) === 0) {
                        toUnregister.push(name);
                    }
                }
            )
            toUnregister.forEach(
                name => this._registrations.delete(name)
            )
            return ok;
        } else if (
            this._registrations.has(name)
            && this._registrations.get(name) === pid
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

    registerRouter(name, pid, options = {}) {
        this._log('registerRouter(%o, %o) : this._routers : %o', name, pid, this._routers);
        if (this._routers.has(name)) {
            const router = this._routers.get(name);
            return router.id;
        } else {
            const id = `${this._routerCount++}`;
            const router = {
                pid,
                id,
                name,
            };
            this._routers.set(name, router);
            this._routersById.set(id, router)
            this._routersByPid.set(pid, router);

            if (options.bridge) {
                for (let [bridge, names] of this._bridges) {
                    this.deliver(bridge, [discover, name, pid])
                    names.forEach(
                        name => this.deliver(pid, [discover, name, bridge])
                    );
                }

                let existing = this._bridges.has(pid)
                    ? this._bridges.get(pid)
                    : [];
                this._bridges.set(pid, [...existing, name]);
            }

            return id;
        }
    }

    unregisterRouter(pid) {
        this._log('unregisterRouter(%o) : this._bridges', pid, this._bridges);
        if (this._routersByPid.has(pid)) {
            const router = this._routersByPid.get(pid);
            const { id, name } = router;
            this._routers.set(name, { ...router, pid: null });
            this._routersById.set(id, { ...router, pid: null });
            this._routersByPid.delete(pid);

            if (this._bridges.has(pid)) {
                const names = this._bridges.get(pid);
                this._log('unregisterRouter(%o) : names : %o', pid, names);
                for (let name of names) {
                    const router = this._routers.get(name);
                    const { id } = router;
                    const pid = null;

                    this._routers.set(name, { ...router, pid });
                    this._routersById.set(id, { ...router, pid });
                    this._routersByPid.delete(pid);
                }
                this._bridges.delete(pid);
            }
        }

        return ok;
    }

    getRouterName(id) {
        this._log('getRouterName(%o) : this._routersById : %o', id, this._routersById);
        const router = this._routersById.get(id);

        if (router) {
            return router.name;
        } else {
            throw new OTPError(['unrecognized_router_id', id]);
        }
    }

    getRouterId(name) {
        const router = this._routers.get(name);

        if (router) {
            return router.id;
        } else {
            throw new OTPError(['unrecognized_router_name', name]);
        }
    }

    ref() {
        return Ref.for(Pid.LOCAL, this._refCount++);
    }
    pid() {
        return Pid.of(Pid.LOCAL, this._processesCount++)
    }

    makeContext() {
        const ctx = new Context(this);
        this._processes.set(
            ctx.self().process,
            ctx
        );
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
        const compare = caseOf(to);
        this._log('deliver(%o) : message : %o', to, message);
        if (compare(Pid.isPid)) {
            this._log('deliver(%o) : PID', to);
            to = new Pid(to);
            if (to.node == Pid.LOCAL) {
                this._log('deliver(%o) : PID : LOCAL', to);
                const ctx = this._processes.get(to.process);
                if (ctx && !ctx.dead) {
                    this._log('deliver(%o) : PID : LOCAL : ctx : %o', to, ctx);
                    ctx._deliver(message);
                    return ok;
                } else {
                    return ok;
                }
            } else {
                this._log('deliver(%o) : PID : REMOTE', to, to.node);
                const router = this._routersById.get(to.node);
                if (router) {
                    return this.deliver(router.pid, [relay, to, message]);
                } else {
                    return ok;
                }
            }
        } else if (compare([_, _])) {
            const [name, node] = to;
            this._log('deliver(%o) : NAME : REMOTE : this._routers : %o', to, this._routers);
            const router = this._routers.get(node)
            this._log('deliver(%o) : NAME : REMOTE : router : %o', to, router);
            if (router) {
                this._log('deliver(%o) : NAME : REMOTE : relay : %o', router.pid);
                return this.deliver(router.pid, [relay, name, message]);
            } else {
                return ok;
            }
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            this._log('deliver(%o) : NAME : LOCAL : %O', to, this._registrations);
            to = this._registrations.get(to);
            return this.deliver(to, message);
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
