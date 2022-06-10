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
} = Symbols;
const { _, spread } = matching.Symbols;

const isExitMessage = matching.match(t(EXIT, _, _), t(EXIT, _, _, _));
const processFlags = new Set([trap_exit]);

export class Context {
    #pid;
    #node;
    #mb;
    #links;
    #monitors;
    #flags;
    #lastMessage;
    #dead;

    get env() {
        return this.#node;
    }

    constructor(parent) {
        this.#pid = parent.pid();
        this.#node = parent;

        const logComponents = [
            'otpjs',
            parent.name.toString(),
            String(this.#pid).toLowerCase(),
        ];
        this.log = debug(logComponents.join(':'));
        this._log = this.log.extend('context');

        this.#mb = new MessageBox(this.log.extend('message-box'));
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
        this.#forwardWithPid('register');
        this.#forwardWithPid('unregister');

        this.death = new Promise(
            (resolve) =>
                (this.die = (reason) => {
                    this.log(
                        'die(%o) : lastMessage : %o',
                        reason,
                        this.#lastMessage
                    );

                    if (reason instanceof OTPError) {
                        resolve(reason);
                    } else {
                        const err = OTPError(reason);
                        Error.captureStackTrace(err, OTPError);
                        resolve(err);
                    }
                })
        );
        this.#dead = false;

        this.death.then((reason) => this.destroy(reason));
    }
    processFlag(flag, value) {
        if (processFlags.has(flag)) {
            if (value) {
                this.#flags.set(flag, value);
            }
            return this.#flags.get(flag);
        } else {
            throw new OTPError(t('unknown_flag', flag));
        }
    }
    destroy(reason) {
        this._log('destroy(self: %o, reason: %o)', this.self(), reason);
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
    async receive(...predicates) {
        let timeout = Infinity;

        if (predicates.length > 0) {
            if (typeof predicates[predicates.length - 1] === 'number') {
                timeout = predicates.pop();
            }
        }

        if (predicates.length === 0) {
            predicates.push(_);
        }

        predicates = predicates.map(matching.compile);

        const [, message, _predicate] = await this.#mb.pop(
            ...predicates,
            timeout
        );

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
        } else if (this.#mb.pending > 0) {
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
            this._log('#notifyMonitors(ref: %o, monitor: %o)', ref, monitor);
            this.#node.signal(pid, DOWN, monitor, ref, reason);
        }
    }
    _processInfo() {
        if (this.#dead) {
            return {
                status: this.#status,
                links: [],
                messageQueueLength: 0,
                messages: [],
                monitors: [],
            };
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
                this._log('forward(%o, %o) : error : %o', operation, name, err);
                throw err;
            }
        };
    }
    #forwardWithPid(operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this.#node[operation](this.self(), ...args);
            } catch (err) {
                this._log(
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
        const self = this;
        route(relay, spread).to(function signalRelay(
            _relay,
            _fromPid,
            message
        ) {
            return self._deliver(message);
        });
        route(link, spread).to(function signalLink(_link, fromPid) {
            return self._link(fromPid);
        });
        route(unlink, spread).to(function signalUnlink(_unlink, fromPid) {
            return self._unlink(fromPid);
        });
        route(monitor, spread).to(function signalMonitor(
            _monitor,
            fromPid,
            ref
        ) {
            return self._monitor(ref, fromPid);
        });
        route(demonitor, spread).to(function signalDemonitor(
            _demonitor,
            _fromPid,
            ref
        ) {
            return self._demonitor(ref);
        });
        route(EXIT, spread).to(function signalEXIT(_exit, fromPid, reason) {
            return self._exit(fromPid, reason);
        });
        route(DOWN, spread).to(function signalDOWN(
            _down,
            fromPid,
            ref,
            reason
        ) {
            return self._deliver(t(DOWN, ref, 'process', fromPid, reason));
        });
        return 'context.signal';
    });

    _link(other) {
        this.#links.add(other);
    }
    _unlink(other) {
        if (!this.#dead) this.#links.delete(other);
    }
    _exit(fromPid, error) {
        const errorIs = matching.caseOf(error);
        this._log(
            '_exit(self: %o, dead: %o, fromPid: %o, error: %o)',
            this.self(),
            this.#dead,
            fromPid,
            error
        );
        if (!this.#dead) {
            const trappingExits = this.processFlag(trap_exit);
            if (!trappingExits || errorIs(kill)) {
                this._log(
                    '_exit(self: %o) : this.die(error: %o)',
                    this.self(),
                    error
                );
                this.die(killed);
            } else {
                const notice = t(EXIT, fromPid, error.term, error.stack);
                this._log('_exit(self: %o, notice: %o)', this.self(), notice);
                this._deliver(notice);
            }
        }
    }
    _deliver(message) {
        this._log('_deliver() : message : %o', message);
        if (!this.#dead) {
            try {
                this.#mb.push(message);
                this._log('_deliver(mb: %o)', this.#mb);
            } catch (err) {
                this._log('_deliver(error: %o) : undeliverable', err);
            }
        } else {
            this._log('_deliver() : DEAD');
        }

        return ok;
    }
    _monitor(ref, watcher) {
        if (!this.#dead) {
            this._log(
                '_monitor(self: %o, ref: %o, watcher: %o)',
                this.self(),
                ref,
                watcher
            );
            this.#monitors.set(ref.toString(), watcher);
        } else {
            this._log(
                '_monitor(self: %o, ref: %o, watcher: %o, error: noproc)',
                this.self(),
                ref,
                watcher
            );
            try {
                this.#node.signal(this.self(), DOWN, watcher, ref, 'noproc');
            } catch (err) {
                this._log(
                    '_monitor(self: %o, ref: %o, error: %o)',
                    this.self(),
                    ref,
                    err
                );
            }
        }
        return ok;
    }
    _demonitor(ref) {
        this.#monitors.delete(ref.toString());
    }
}
