import debug from 'debug';
import { Pid, Ref } from './types.js';
import { Context } from './context.js';
import { ok, _, normal, badarg, DOWN, EXIT, relay } from './symbols';
import { OTPError } from './error';
import { caseOf } from './matching';

const log = debug('otpjs:core:node');

export class Node {
    static nodes = 0;
    constructor(id = Symbol.for(`otp@${Node.nodes++}`)) {
        this._id = id;
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

    monitor(watcherPid, watcheePid) {
        const ref = this.ref();

        const watchee = this._processes.get(watcheePid.process);
        if (watchee) {
            const ctx = watchee.deref();
            if (ctx) {
                this._monitors.set(ref, ctx);
            } else {
                this.deliver(
                    watcherPid,
                    [
                        DOWN,
                        watcheePid,
                        'noproc'
                    ]
                )
            }
        } else {
            this.deliver(
                watcherPid,
                [
                    DOWN,
                    watcheePid,
                    'noproc'
                ]
            )
        }

        return ref;
    }

    demonitor(ref) {
        this._monitors.delete(ref);
    }


    async system(ctx) {
        let running = true;
        while (running) {
            const message = await ctx.receive();
        }
    }

    register(pid, name) {
        const ref = this._processes.get(pid.process);
        if (ref) {
            const proc = ref.deref();
            if (proc) {
                if (this._registrations.has(name)) {
                    this._log('register(%o, %o) : registration.has(name)', pid, name);
                    throw new OTPError(badarg);
                } else {
                    this._registrations.set(name, pid);

                    this._log('register(%o, %o)', pid, name);

                    const node = this;
                    proc.death.finally(
                        () => {
                            node.unregister(pid)
                        }
                    );

                    return ok;
                }
            } else {
                this._log('register(%o, %o) : proc.deref() === undefined', pid, name);
                throw new OTPError(badarg);
            }
        } else {
            this._log('register(%o, %o) : processes.get(%o) === undefined', pid, name);
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

    registerRouter(name, pid) {
        const id = `${this._routerCount++}`;
        if (pid) {
            this._routers.set(name, pid);
            this._routersById.set(id, pid);
        }
        this._routerIdsByName.set(name, id);
        this._routerNamesById.set(id, name);
        if (pid) {
            this.register(pid, `router-by-id-${id}`);
            this.register(pid, `router-by-name-${name.toString()}`);
        }
        return id;
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
            new WeakRef(ctx)
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
        try {
            ctx._log('doSpawn() : fun : %o', fun);
            let result = await fun(ctx);
            ctx._log('doSpawn() : ctx.die(normal) (result: %o)', result);
            ctx.die(normal);
        } catch (err) {
            ctx._log('doSpawn() : error : %o', err);
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
                const ref = this._processes.get(to.process);
                this._log('deliver(%o) : PID : LOCAL : ref : %o', to, ref)
                if (ref) {
                    const ctx = ref.deref();
                    if (ctx) {
                        this._log('deliver(%o) : PID : LOCAL : ctx : %o', to, ctx);
                        ctx._deliver(message);
                    }
                }
            } else {
                this._log('deliver(%o) : PID : REMOTE', to, to.node);
                const pid = this._routersById.get(to.node);
                if (pid) {
                    this.deliver(pid, [relay, to, message]);
                }
            }
        } else if (compare([_, _])) {
            const [name, node] = to;
            log('deliver(%o) : NAME : REMOTE', to);
            const pid = this._routers.get(node)
            if (pid) {
                this.deliver(pid, [relay, name, message]);
            }
        } else if (compare(undefined)) {
            throw new OTPError(badarg);
        } else {
            log('deliver(%o) : NAME : LOCAL', to);
            to = this._registrations.get(to);
            this.deliver(to, message);
        }
        this._log('deliver(%o)', to);
    }

    processInfo(pid) {
        const ref = this._processes.get(new Pid(pid).process);
        if (ref) {
            return ref.deref()
        } else {
            return undefined;
        }
    }
}
