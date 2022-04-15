import debug from 'debug';
import { Pid, OTPError, t } from '@otpjs/types';
import { MessageBox } from './message-box.js';
import * as matching from '@otpjs/matching';
import * as Symbols from './symbols';

const { DOWN, EXIT, relay, link, unlink, monitor, demonitor, trap_exit } =
    Symbols;
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
        this._dead = false;

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
        this._dead = true;
        this.#notifyMonitors(reason);
        this.#notifyLinks(reason);

        const inbox = this.#mb;

        this.#mb = null;
        this.#pid = null;
        this.#node = null;
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
        return this.#node.exit(pid, reason);
    }
    get dead() {
        return this._dead;
    }
    get #status() {
        if (this._dead) {
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
            this._log('#notifyMonitors(ref: %o, monitor: %o)', ref, monitor);
            this.#node.signal(pid, DOWN, monitor, ref, reason);
        }
    }
    _processInfo() {
        if (this._dead) {
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

    signal = matching.clauses((route) => {
        const self = this;
        route(relay, spread).to(function signalRelay(
            _relay,
            _fromPid,
            message
        ) {
            return self._deliver(message);
        });
        route(link, spread).to(function signalLink(_link, fromPid) {
            self._link(fromPid);
        });
        route(unlink, spread).to(function signalUnlink(_unlink, fromPid) {
            self._unlink(fromPid);
        });
        route(monitor, spread).to(function signalMonitor(
            _monitor,
            fromPid,
            ref
        ) {
            self._monitor(ref, fromPid);
        });
        route(demonitor, spread).to(function signalDemonitor(
            _demonitor,
            _fromPid,
            ref
        ) {
            self._demonitor(ref);
        });
        route(EXIT, spread).to(function signalEXIT(_exit, fromPid, reason) {
            self._exit(fromPid, reason);
        });
        route(DOWN, spread).to(function signalDOWN(
            _down,
            fromPid,
            ref,
            reason
        ) {
            self._deliver(t(DOWN, ref, 'process', fromPid, reason));
        });
        return 'context.signal';
    });

    _link(other) {
        this.#links.add(other);
    }
    _unlink(other) {
        this.#links.delete(other);
    }
    _exit(fromPid, error) {
        this._log(
            '_exit(self: %o, dead: %o, fromPid: %o, error: %o)',
            this.self(),
            this._dead,
            fromPid,
            error
        );
        if (!this._dead) {
            if (!this.processFlag(trap_exit)) {
                this.die(error);
            } else {
                this._deliver(t(EXIT, fromPid, error.term, error.stack));
            }
        }
    }
    _deliver(message) {
        this._log('_deliver() : message : %o', message);
        if (!this._dead) {
            try {
                this.#mb.push(message);
                this._log('_deliver(mb: %o)', this.#mb);
            } catch (err) {
                this._log('_deliver(error: %o) : undeliverable', err);
            }
        } else {
            this._log('_deliver() : DEAD');
        }
    }
    _monitor(ref, watcher) {
        this.#monitors.set(ref, watcher);
    }
    _demonitor(ref) {
        this.#monitors.delete(ref);
    }
}
