import debug from 'debug';
import { Pid, OTPError, t } from '@otpjs/types';
import { MessageBox } from './message-box.js';
import * as matching from '@otpjs/matching';
import * as Symbols from './symbols';

const { DOWN, EXIT, trap_exit } = Symbols;
const { _ } = matching.Symbols;

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

    constructor(parent) {
        this.#pid = parent.pid();
        this.#node = parent;

        const logComponents = [
            'otpjs',
            parent.name.toString(),
            this.#pid.toLowerCase(),
        ];
        this.log = debug(logComponents.join(':'));
        this._log = this.log.extend('context');

        this.#mb = new MessageBox(this.log.extend('message-box'));
        this.#links = new Set();
        this.#monitors = new Map();
        this.#flags = new Map();

        this.#forward('deliver', 'send');
        this.#forward('demonitor');
        this.#forward('ref');
        this.#forward('spawn');
        this.#forward('whereis');
        this.#forward('node');
        this.#forward('nodes');
        this.#forward('processInfo');
        this.#forwardWithSelf('spawnLink');
        this.#forwardWithSelf('spawnMonitor');
        this.#forwardWithSelf('link');
        this.#forwardWithSelf('unlink');
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
                    const err = OTPError(reason);
                    Error.captureStackTrace(err, OTPError);
                    resolve(err);
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
    #notifyLinks(error) {
        const pid = this.self();
        for (let link of this.#links) {
            this.send(link, t(EXIT, pid, error.term, error.stack));
        }
    }
    #notifyMonitors(error) {
        const pid = this.self();
        for (let [ref, monitor] of this.#monitors) {
            this.send(monitor, t(DOWN, ref, 'process', pid, error.term));
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
    #forwardWithSelf(operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this.#node[operation](this, ...args);
            } catch (err) {
                this._log(
                    'forwardWithSelf(%o, %o) : error : %o',
                    operation,
                    name,
                    err
                );
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
    _link(other) {
        this.#links.add(other);
    }
    _unlink(other) {
        this.#links.delete(other);
    }
    _deliver(message) {
        this._log('_deliver() : message : %o', message);
        if (!this._dead) {
            if (isExitMessage(message) && !this.processFlag(trap_exit)) {
                this._log('_deliver(exitMessage: %o)', message);
                if (message.length === 3) {
                    this.die(message[message.length - 1]);
                } else if (message.length === 4) {
                    this.die(message[message.length - 2]);
                }
            } else {
                try {
                    this.#mb.push(message);
                    this._log('_deliver(mb: %o)', this.#mb);
                } catch (err) {
                    this._log('_deliver(error: %o) : undeliverable', err);
                }
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
