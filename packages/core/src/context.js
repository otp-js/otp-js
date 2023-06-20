import { Pid, OTPError, t, l, cons, cdr, car, Ref } from '@otpjs/types';
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
    badarg
} = Symbols;
const { _, spread, skip_matching } = matching.Symbols;
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

    get [skip_matching]() {
        return true;
    }

    constructor(parent) {
        this.#pid = parent.pid();
        this.#node = parent;

        this.#logger = parent.logger(this.self().toString().toLowerCase());
        this.#log = this.logger('context');

        this.#mb = new MessageBox(this.logger('message-box'));
        this.#links = l.nil;
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
            (resolve) => (this.die = (reason) => resolve(reason))
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

    async receive(predicate, timeout = Infinity) {
        this.#log(
            'receive(length: %o, arguments: %o)',
            arguments.length,
            arguments
        );
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

        const [, message] = await this.#mb.pop(
            (message) => predicate(message)
                ? Promise.resolve(t(ok, message))
                : false,
            timeout
        );
        this.#lastMessage = message;

        return message;
    }

    async receiveBlock(composer) {
        let blocks = l.nil;
        let onTimeout = null;
        let timeout = Infinity;

        const given = (pattern) => ({
            then: (block) => (blocks = cons(t(matching.compile(pattern), block), blocks))
        });
        const after = (ms) => ({
            then: (block) => {
                onTimeout = block;
                timeout = ms;
            }
        });

        composer(given, after);
        blocks = blocks.reverse();

        const evaluate = (message) => {
            let found = false;
            let it = blocks;
            while (!found && l.isList(it) && !l.isEmpty(it)) {
                const [pattern, block] = car(it);
                try {
                    const result = pattern(message);
                    this.#log(
                        'evaluate(pattern: %o, message: %o, result: %o)',
                        pattern,
                        message,
                        result
                    );
                    if (result) {
                        found = block;
                    } else {
                        it = cdr(it);
                    }
                } catch (err) {
                    it = cdr(it);
                    this.#log(
                        'evaluate(pattern: %o, message: %o, error: %o)',
                        pattern,
                        message,
                        error
                    );
                }
            }

            if (found) {
                return Promise.resolve(found(message));
            } else {
                return false;
            }
        };

        try {
            const result = await this.#mb.pop(evaluate, timeout);
            this.#log('receiveBlock(result: %o)', result);
            return result;
        } catch (err) {
            this.#log('receiveBlock(error: %o)', err);
            if (err.term === Symbols.timeout) {
                return onTimeout();
            } else {
                throw err;
            }
        }
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
        if (this.#mb.isReceiving) {
            return 'waiting';
        } else {
            return 'running';
        }
    }

    #notifyLinks(reason) {
        const pid = this.self();
        for (const link of this.#links) {
            this.#node.signal(pid, EXIT, link, reason);
        }
    }

    #notifyMonitors(reason) {
        const pid = this.self();
        if (reason instanceof OTPError) {
            reason = reason.term;
        }
        for (let [ref, monitor] of this.#monitors) {
            ref = Ref.fromString(ref);
            this.#log('#notifyMonitors(ref: %o, monitor: %o)', ref, monitor);
            this.#node.signal(pid, DOWN, monitor, ref, reason);
        }
    }

    _processInfo() {
        if (this.#dead) {
            return undefined;
        } else {
            const info = {
                status: this.#status,
                links: Array.from(this.#links),
                messageQueueLength: this.#mb.length,
                messages: Array.from(this.#mb),
                monitors: Array.from(this.#monitors.values())
            };

            this.#log('_processInfo(infO: %o)', info);

            return info;
        }
    }

    drain(reason) {
        this.#mb.clear(reason);
    }

    #forward(operation, name = operation) {
        this.#log('#forward(operation: %o, name: %o)', operation, name);
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
        setTimeout(() => {
            try {
                this.#log('signal(...%o)', args);
                return this.#signal(...args);
            } catch (err) {
                return t(error, err);
            }
        });
        return ok;
    }

    #signal = matching.clauses((route) => {
        route(relay, spread).to(
            (_relay, _fromPid, message) => this.#deliver(message)
        );
        route(link, spread).to(
            (_link, fromPid) => this.#link(fromPid)
        );
        route(unlink, spread).to(
            (_unlink, fromPid) => this.#unlink(fromPid)
        );
        route(monitor, spread).to(
            (_monitor, fromPid, ref) => this.#monitor(ref, fromPid)
        );
        route(demonitor, spread).to(
            (_demonitor, _fromPid, ref) => this.#demonitor(ref)
        );
        route(EXIT, spread).to(
            (_exit, fromPid, reason) => this.#exit(fromPid, reason)
        );
        route(DOWN, spread).to(
            (_down, fromPid, ref, reason) =>
                this.#deliver(t(DOWN, ref, 'process', fromPid, reason))
        );
        return 'context.signal';
    }, 'context.signal');

    #link(other) {
        const found = this.#links.find((pid) => Pid.compare(other, pid) === 0);
        this.#log('#link(other: %o, #links: %o, found: %o)', other, this.#links, found);
        if (!found) {
            this.#links = cons(other, this.#links);
        }
    }

    #unlink(other) {
        this.#links = this.#links?.deleteWhere((pid) => Pid.compare(other, pid) === 0);
        this.#log('#unlink(other: %o, #links: %o)', other, this.#links);
    }

    #exit(fromPid, reason) {
        this.#log('#exit(fromPid: %o, reason: %o)', fromPid, reason);
        this.#log(
            '_exit(self: %o, dead: %o, fromPid: %o, reason: %o)',
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
                const reasonIs = matching.caseOf(reason);
                if (reasonIs(kill)) {
                    this.die(killed);
                } else {
                    this.die(reason);
                }
            } else {
                const notice = t(EXIT, fromPid, reason);
                this.#log('_exit(self: %o, notice: %o)', this.self(), notice);
                this.#deliver(notice);
            }
        }
    }

    #deliver(message) {
        this.#log('_deliver() : message : %o', message);
        this.#mb?.push(message);
        return ok;
    }

    async #monitor(ref, watcher) {
        this.#log(
            '_monitor(self: %o, ref: %o, watcher: %o)',
            this.self(),
            ref,
            watcher
        );
        this.#monitors.set(ref.toString(), watcher);
        return ok;
    }

    #demonitor(ref) {
        this.#monitors.delete(ref.toString());
    }

    set log(logger) {
        this.#logger = logger;
    }

    logger(...segments) {
        return this.#logger.extend(...segments);
    }
}
