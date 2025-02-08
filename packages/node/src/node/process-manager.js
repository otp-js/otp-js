import debug from 'debug';
import { Pid } from '@otpjs/types';

export class ProcessManager {
    #Context;
    #finalizer;
    #living;
    #node;
    #processes;
    #processesCount;
    #log;

    constructor(node, Context) {
        this.#log = node.logger('process-manager');
        this.#node = node;
        this.#processes = new Map();
        this.#processesCount = 0;
        this.#living = new Set();
        this.#Context = Context;

        this.#finalizer = new FinalizationRegistry((pid) => {
            this.#log('finalize(pid: %o)', pid);
            this.#processes.delete(pid.process);
            this.#node.exec('unregister', [pid]);
        });

        node.addFunction('processInfo', this.#processInfo.bind(this));
    }
    #processInfo(pid) {
        const ctx = this.find(pid);
        if (ctx) {
            return ctx._processInfo();
        } else {
            return undefined;
        }
    }
    find(pid) {
        const ref = this.#processes.get(pid.process);

        if (ref) {
            return ref.deref();
        } else {
            return undefined;
        }
    }

    #nextPid() {
        return Pid.of(Pid.LOCAL, this.#processesCount++, 0, 1);
    }

    create() {
        const pid = this.#nextPid();
        const ctx = new this.#Context(this.#node, pid);

        this.#processes.set(pid.process, new WeakRef(ctx));
        this.#living.add(ctx);
        this.#finalizer.register(ctx, ctx.self());

        ctx.death.finally(this.#living.delete(ctx));

        return ctx;
    }
}
