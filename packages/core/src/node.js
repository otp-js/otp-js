import debug from 'debug';
import { Pid, Ref } from './types.js';
import { Context } from './context.js';
import { ok, _, normal, badarg, DOWN, EXIT } from './symbols';
import { OTPError } from './error';

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

        this._log = log.extend(this.name);

        this._system = this.spawn((ctx) => this.system(ctx));
    }

    get name() {
        if (typeof this._id === 'symbol') {
            return Symbol.keyFor(this._id);
        } else {
            return this._id;
        }
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
        if (Pid.isPid(to)) {
            to = new Pid(to);
        } else {
            to = this._registrations.get(to);
        }
        if (to.node == Pid.LOCAL) {
            const ref = this._processes.get(to.process);
            if (ref) {
                try {
                    const ctx = ref.deref();
                    ctx._deliver(message);
                } catch (err) {
                    this._log('_deliver(%o, %o) : error : %o', to, message, err);
                }
            }
        } else {
            const ref = this._routers.get(to.node);
            if (ref) {
                const ctx = ref.deref();
                ctx._deliver({
                    to,
                    message
                });
            }
        }
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
