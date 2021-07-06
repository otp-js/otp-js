import { Pid, Ref } from './types.js';
import { Context } from './context.js';
import debug from 'debug';
import { v4 } from 'uuid';

const log = debug('otpjs:core:node');

export class Node {
    constructor() {
        this._id = v4();
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
        const log = debug('otpjs:core:node:system');
        let running = true;
        while (running) {
            log('awaiting message');
            const message = await ctx.receive();
            log('message : %o', message);
        }
    }

    register(pid, name) {
        log('register(%o, %o)', pid, name);
        const ref = this._processes.get(pid.process);
        log('register(%o, %o) : ref : %o', pid, name, ref)
        if (ref) {
            const proc = ref.deref();
            log('register(%o, %o) : proc : %o', pid, name, proc);
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
        log('whereis(%o: this._registrations : %o', name, this._registrations);
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
        return new Context(this);
    }

    spawn(fun) {
        const ctx = this.makeContext();

        this._processes.set(
            ctx.self().process,
            new WeakRef(ctx)
        );

        Promise.resolve(fun(ctx)).finally(() => {
            this._processes.delete(ctx.self().process);
            ctx.die();
        })

        return ctx.self();
    }

    deliver(to, message) {
        if (Pid.isPid(to)) {
            to = new Pid(to);
        } else {
            to = this._registrations.get(to);
        }
        log('deliver(%o, %o)', to, message);
        if (to.node == Pid.LOCAL) {
            log('deliver(%o, %o) : LOCAL', to, message);
            const ref = this._processes.get(to.process);
            if (ref) {
                const ctx = ref.deref();
                log('deliver(%o, %o) : LOCAL : ctx : %o', to, message, ctx);
                ctx._deliver(message);
            }
        } else {
            log('deliver(%o, %o) : REMOTE', to, message);
            log('deliver(%o, %o) : REMOTE : this._processes : %o', to, message, this._processes);
            const ref = this._processes.get(to.node);
            if (ref) {
                const ctx = ref.deref();
                log('deliver(%o, %o) : REMOTE : ctx : %o', to, message, ctx);
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
