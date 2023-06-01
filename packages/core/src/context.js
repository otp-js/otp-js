import debug from 'debug';
import { Pid, OTPError, t, Ref } from '@otpjs/types';
import { MessageBox } from './message-box.js';
import * as matching from '@otpjs/matching';
import * as Symbols from './symbols';

const {
    ok,
    DOWN,
    EXIT,
    error,
    relay,
    kill,
    killed,
    link,
    unlink,
    monitor,
    demonitor,
    trap_exit,
    badarg,
} = Symbols;
const { _, spread } = matching.Symbols;

const isExitMessage = matching.match(t(EXIT, _, _), t(EXIT, _, _, _));
const processFlags = new Set([trap_exit]);

export class Context {
    #pid;
    #node;
    #mb;
    #links;
    #log;
    #logger;
    #monitors;
    #flags;
    #lastMessage;
    #dead;

    get env() {
        return this.#node;
    }

    get log() {
        return this.#logger;
    }

    constructor(parent) {
        this.#pid = parent.pid();
        this.#node = parent;

        this.#logger = parent.logger(this.self().toString().toLowerCase());
        this.#log = this.logger('context');

        this.#mb = new MessageBox(this.logger('message-box'));
        this.#links = new Set();
        this.#monitors = new Map();
        this.#flags = new Map();

        this.#forwardWithPid('deliver', 'send');
        this.#forwardWithPid('demonitor');
        this.#forward('ref');
        this.#forward('spawn');
        this.#forward('whereis');
        this.#forward('node');
        this.#forward('nodes');
        this.#forward('processInfo');
        this.#forwardWithPid('spawnLink');
        this.#forwardWithPid('spawnMonitor');
        this.#forwardWithPid('link');
        this.#forwardWithPid('unlink');
        this.#forwardWithPid('monitor');
        this.#forwardWithPid('monitorNode');
        this.#forwardWithPid('register');
        this.#forwardWithPid('unregister');

        this.death = new Promise(
            (resolve) =>
                (this.die = (reason) => {
                    this.#log(
                        'die(%o) : lastMessage : %o',
                        reason,
                        this.#lastMessage
                    );

                    resolve(reason);
                })
        );
        this.#dead = false;

        this.death.then((reason) => this.destroy(reason));
    }
    processFlag(flag, value) {
        this.#log('processFlag(flag: %o)', flag);
        if (processFlags.has(flag)) {
            if (value) {
                this.#flags.set(flag, value);
            }
            return this.#flags.get(flag);
        } else {
            this.#log('processFlag(bad_flag: %o)', flag);
            throw OTPError(t('unknown_flag', flag));
        }
    }
    destroy(reason) {
        this.#log('destroy(self: %o, reason: %o)', this.self(), reason);
        this.#dead = true;
        this.#notifyMonitors(reason);
        this.#notifyLinks(reason);

        const inbox = this.#mb;

        this.#mb = null;
        this.#links = null;

        inbox.clear(reason);
    }
    self() {
        return this.#pid;
    }
    async receive(predicate, timeout) {
        if (arguments.length === 0) {
            timeout = Infinity;
            predicate = _;
        } else if (arguments.length === 1) {
            if (typeof predicate === 'number') {
                timeout = predicate;
                predicate = _;
            }
        } else if (arguments.length > 2) {
            throw OTPError(badarg);
        }

        predicate = matching.compile(predicate);

        const [, message] = await this.#mb.pop(predicate, timeout);
        this.#lastMessage = message;

        return message;
    }
    async receiveWithPredicate(...predicates) {
        let timeout = Infinity;

        if (typeof predicates[predicates.length - 1] === 'number') {
            timeout = predicates.pop();
        }

        predicates = predicates.map(matching.compile);

        const [, message, predicate] = await this.#mb.pop(
            ...predicates,
            timeout
        );

        return [message, predicate];
    }
    exit(pid, reason) {
        if (!Pid.isPid(pid)) {
            reason = pid;
            pid = this.#pid;
        }
        return this.#node.exit(this.#pid, pid, reason);
    }
    get dead() {
        return this.#dead;
    }
    get #status() {
        if (this.#dead) {
            return 'exiting';
        } else if (this.#mb.isReceiving) {
            return 'waiting';
        } else {
            return 'running';
        }
    }
    #notifyLinks(reason) {
        const pid = this.self();
        for (let link of this.#links) {
            this.#node.signal(pid, EXIT, link, reason);
        }
    }
    #notifyMonitors(reason) {
        const pid = this.self();
        if (reason instanceof Error) {
            reason = reason.term;
        }
        for (let [ref, monitor] of this.#monitors) {
            ref = Ref.from(ref);
            this.#log('#notifyMonitors(ref: %o, monitor: %o)', ref, monitor);
            this.#node.signal(pid, DOWN, monitor, ref, reason);
        }
    }
    _processInfo() {
        if (this.#dead) {
            return undefined;
        } else {
            return {
                status: this.#status,
                links: Array.from(this.#links),
                messageQueueLength: this.#mb.length,
                messages: Array.from(this.#mb),
                monitors: Array.from(this.#monitors.values()),
            };
        }
    }
    drain(reason) {
        if (this.#mb) {
            this.#mb.clear(reason);
        }
    }
    #forward(operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this.#node[operation](...args);
            } catch (err) {
                this.#log('forward(%o, %o) : error : %o', operation, name, err);
                throw err;
            }
        };
    }
    #forwardWithPid(operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this.#node[operation](this.self(), ...args);
            } catch (err) {
                this.#log(
                    'forwardWithPid(%o, %o) : error : %o',
                    operation,
                    name,
                    err
                );
                throw err;
            }
        };
    }

    signal(...args) {
        try {
            return this.#signal(...args);
        } catch (err) {
            return t(error, err);
        }
    }

    #signal = matching.clauses((route) => {
        route(relay, spread).to((_relay, _fromPid, message) =>
            this.#deliver(message)
        );
        route(link, spread).to((_link, fromPid) => this.#link(fromPid));
        route(unlink, spread).to((_unlink, fromPid) => this.#unlink(fromPid));
        route(monitor, spread).to((_monitor, fromPid, ref) =>
            this.#monitor(ref, fromPid)
        );
        route(demonitor, spread).to((_demonitor, _fromPid, ref) =>
            this.#demonitor(ref)
        );
        route(EXIT, spread).to((_exit, fromPid, reason) =>
            this.#exit(fromPid, reason)
        );
        route(DOWN, spread).to((_down, fromPid, ref, reason) =>
            this.#deliver(t(DOWN, ref, 'process', fromPid, reason))
        );
        return 'context.signal';
    }, 'context.signal');

    #link(other) {
        this.#links.add(other);
    }
    #unlink(other) {
        if (!this.#dead) this.#links.delete(other);
    }
    #exit(fromPid, reason) {
        const reasonIs = matching.caseOf(reason);
        this.#log(
            '_exit(self: %o, dead: %o, fromPid: %o, error: %o)',
            this.self(),
            this.#dead,
            fromPid,
            reason
        );
        if (!this.#dead) {
            const trappingExits = this.processFlag(trap_exit);
            if (!trappingExits) {
                this.#log(
                    '_exit(self: %o) : this.die(error: %o)',
                    this.self(),
                    reason
                );
                if (reasonIs(kill)) {
                    this.die(killed);
                } else {
                    this.die(reason);
                }
            } else {
                const notice = t(EXIT, fromPid, reason.term, reason.stack);
                this.#log('_exit(self: %o, notice: %o)', this.self(), notice);
                this.#deliver(notice);
            }
        }
    }
    #deliver(message) {
        this.#log('_deliver() : message : %o', message);
        if (!this.#dead) {
            try {
                this.#mb.push(message);
                this.#log('_deliver(mb: %o)', this.#mb);
            } catch (err) {
                this.#log('_deliver(error: %o) : undeliverable', err);
            }
        } else {
            this.#log('_deliver() : DEAD');
        }

        return ok;
    }
    #monitor(ref, watcher) {
        if (!this.#dead) {
            this.#log(
                '_monitor(self: %o, ref: %o, watcher: %o)',
                this.self(),
                ref,
                watcher
            );
            this.#monitors.set(ref.toString(), watcher);
            return ok;
        } else {
            return t(error, 'noproc');
        }
    }
    #demonitor(ref) {
        this.#monitors.delete(ref.toString());
    }

    get log() {
        return this.#log;
    }

    set log(logger) {
        this.#log = logger;
    }

    logger(...segments) {
        return this.#logger.extend(...segments);
    }
}
