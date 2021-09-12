import debug from 'debug';
import { Pid, Ref } from './types.js';
import { Context } from './context.js';
import { ok, _, discover, normal, badarg, monitor, DOWN, EXIT, relay } from './symbols';
import { OTPError } from './error';
import { caseOf } from './matching';

const log = debug('otpjs:core:node');

export class Node {
    static nodes = 0;
    constructor(id = Symbol.for(`otp@${Node.nodes++}`)) {
        this._id = id;
        this._finalizer = new FinalizationRegistry((pid) => {
            log('finalize(%o)', pid);
            this._processes.delete(pid.process);
            this.unregister(pid);
        });
        this._monitors = new Map();
        this._processes = new Map();
        this._processesCount = 0;
        this._routers = new Map();
        this._routersById = new Map();
        this._routerNamesById = new Map();
        this._routerIdsByName = new Map();
        this._routerCount = 1;
        this._refCount = 0;
        this._registrations = new Map();
        this._bridges = new Set();

        this._log = log.extend(this.name.toString());

        this._system = this.spawn((ctx) => this.system(ctx));
    }

    get name() {
        return this._id;
    }

    node() {
        return this.name;
    }

    nodes() {
        return Array.from(this._routerNamesById.values());
    }

    exit(pid, reason) {
        const message = [EXIT, reason, Error().stack];
        return this.deliver(pid, message);
    }

    link(ctx, pidB) {
        const pidA = ctx.self();
        const compare = caseOf(pidB);

        this._log('monitor(%o, %o)', pidA, pidB);

        if (compare(Pid.isPid)) {
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._unlink(watchee);
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
            return ref;
        } else if (compare([_, _])) {
            const [name, node] = pidB;
            const pid = this._routers.get(node)
            if (pid) {
                this.deliver(pid, [monitor, name, ref, pidA]);
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
            return ref;
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            pidB = this._registrations.get(pidB);
            return this.link(pidA, pidB);
        }
    }

    unlink(ctx, pidB) {
        if (compare(Pid.isPid)) {
            const watchee = this._processes.get(pidB.process);
            if (watchee) {
                ctx._unlink(watchee);
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
            return ref;
        } else if (compare([_, _])) {
            const [name, node] = pidB;
            const pid = this._routers.get(node)
            if (pid) {
                this.deliver(pid, [monitor, name, ref, pidA]);
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
            return ref;
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            pidB = this._registrations.get(pidB);
            return this.link(pidA, pidB);
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
            const pid = this._routers.get(node)
            if (pid) {
                this.deliver(pid, [monitor, name, ref, watcherPid]);
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
        if (this._routerIdsByName.has(name)) {
            return this._routerIdsByName.get(name);
        } else {
            const id = `${this._routerCount++}`;
            if (pid) {
                this._routers.set(name, pid);
                this._routersById.set(id, pid);
            }
            this._routerIdsByName.set(name, id);
            this._routerNamesById.set(id, name);
            if (pid && pid.node === Pid.LOCAL) {
                this.register(pid, `router-by-id-${id}`);
                this.register(pid, `router-by-name-${name.toString()}`);
            }

            log('registerRouter() : options : %o', options);

            if (options.bridge) {
                this._routerIdsByName.forEach((id, name) => {
                    const router = this._routers.get(name);
                    this.deliver(pid, [discover, id, name, router]);
                });
                this._bridges.add(pid);
            }

            return id;
        }
    }

    unregisterRouter(name, pid) {
        try {
            const id = this._routerIdsByName.get(name);
            if (this._routers.get(name) === pid) {
                this._routers.delete(name);
                this._routerIdsByName.delete(name);
                this._routerNamesById.delete(id);
            }
        } catch (err) {
            log('unregisterRouter(%o) : error : %o', name, err);
        }

        try {
            this.unregister(pid);
        } catch (err) {
            log('unregisterRouter(%o) : error : %o', name, err);
        }

        return ok;
    }

    getRouterName(id) {
        return this._routerNamesById.get(id);
    }

    getRouterId(name) {
        if (this._routerIdsByName.has(name)) {
            return this._routerIdsByName.get(name);
        } else {
            return this.registerRouter(name, undefined);
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

        ctx.link(linked);
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
                const pid = this._routersById.get(to.node);
                if (pid) {
                    return this.deliver(pid, [relay, to, message]);
                } else {
                    return ok;
                }
            }
        } else if (compare([_, _])) {
            const [name, node] = to;
            log('deliver(%o) : NAME : REMOTE', to);
            const pid = this._routers.get(node)
            if (pid) {
                log('deliver(%o) : NAME : REMOTE : relay : %o', pid);
                return this.deliver(pid, [relay, name, message]);
            } else {
                return ok;
            }
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            log('deliver(%o) : NAME : LOCAL', to);
            to = this._registrations.get(to);
            return this.deliver(to, message);
        }
    }

    processInfo(pid) {
        const ctx = this._processes.get(new Pid(pid).process);
        if (ctx) {
            return ctx;
        } else {
            return undefined;
        }
    }
}
