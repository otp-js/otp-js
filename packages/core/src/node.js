import { Pid, Ref } from './types.js';
import { Context } from './context.js';

export class Node {
    constructor(id = Symbol()) {
        this._id = id;
        this._processes = new Map();
        this._processesCount = 0;
        this._routers = new Map();
        this._routersById = new Map();
        this._routerCount = 1;
        this._refCount = 0;
        this._registrations = new Map();

        this.spawn((ctx) => this.system(ctx));
    }

    async system(ctx) {
        let running = true;
        while (running) {
            const message = await ctx.receive();
            // TODO: do something
        }
    }

    register(pid, name) {
        const ref = this._processes.get(pid.process);
        if (ref) {
            const proc = ref.deref();
            if (proc) {
                if (this._registrations.has(name)) {
                    throw Error('badarg');
                } else {
                    this._registrations.set(name, pid);

                    const node = this;
                    (async function() {
                        await proc.death;
                        node.unregister(name);
                    })();
                }
            }
        }
    }

    unregister(name) {
        this._registrations.delete(name);
    }

    registerRouter(name, pid) {
        const id = `${this._routerCount++}`;
        this._routers.set(name, pid);
        this._routersById.set(id, name);
        return id;
    }

    whereis(name) {
        if (this._registrations.has(name)) {
            return this._registrations.get(name);
        } else {
            return undefined;
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
        return ctx;
    }

    spawn(fun) {
        const ctx = this.makeContext();
        const pid = ctx.self();

        Promise.resolve(fun(ctx)).then(
            () => ctx.die(),
            (err) => ctx.die(err.message)
        ).finally(
            () => {
                this._processes.delete(pid.process);
            }
        )

        return pid;
    }

    spawnLink(linked, fun) {
        const ctx = this.makeContext();
        const pid = ctx.self();

        ctx.link(linked);

        Promise.resolve(fun(ctx)).then(
            () => ctx.die(),
            (err) => ctx.die(err.message)
        ).finally(
            () => this._processes.delete(
                pid.process
            )
        );

        return pid;
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
                const ctx = ref.deref();
                ctx._deliver(message);
            }
        } else {
            const ref = this._processes.get(to.node);
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
