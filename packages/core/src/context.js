import debug from 'debug';
import { OTPError, Pid, t, l } from '@otpjs/types';
import { match, compile } from '@otpjs/matching';
import { MessageBox } from './message-box.js';
import { DOWN, EXIT, _, trap_exit } from './symbols';

const node = Symbol();
const mb = Symbol();
const pid = Symbol();
const forward = Symbol();
const forwardWithSelf = Symbol();
const forwardWithPid = Symbol();
const links = Symbol();
const monitors = Symbol();
const flags = Symbol();
const lastMessage = Symbol();
const status = Symbol();

const isExitMessage = match(t(EXIT, _, _), t(EXIT, _, _, _));

export class Context {
    constructor(parent) {
        this[pid] = parent.pid();
        this[node] = parent;

        const logComponents = [
            'otpjs',
            parent.name.toString(),
            this[pid].toLowerCase(),
        ];
        this.log = debug(logComponents.join(':'));
        this._log = this.log.extend('context');

        this[mb] = new MessageBox(this.log.extend('message-box'));
        this[links] = new Set();
        this[monitors] = new Map();
        this[flags] = new Map();

        this[forward]('deliver', 'send');
        this[forward]('demonitor');
        this[forward]('ref');
        this[forward]('spawn');
        this[forward]('whereis');
        this[forward]('node');
        this[forward]('nodes');
        this[forward]('processInfo');
        this[forwardWithSelf]('spawnLink');
        this[forwardWithSelf]('spawnMonitor');
        this[forwardWithSelf]('link');
        this[forwardWithSelf]('unlink');
        this[forwardWithPid]('monitor');
        this[forwardWithPid]('register');
        this[forwardWithPid]('unregister');

        this.death = new Promise(
            (resolve) =>
                (this.die = (reason) => {
                    this.log(
                        'die(%o) : lastMessage : %o',
                        reason,
                        this[lastMessage]
                    );
                    resolve(reason);
                })
        );
        this._dead = false;

        this.death.then((reason) => this.destroy(reason));
    }

    _link(other) {
        this[links].add(other);
    }

    _unlink(other) {
        this[links].delete(other);
    }

    processFlag(flag, value) {
        if (flag in this) {
            this[flag] = value;
        } else {
            throw new OTPError(t('unknown_flag', flag));
        }
    }

    _notifyLinks(reason) {
        const pid = this.self();
        for (let link of this[links]) {
            this.send(link, t(EXIT, pid, reason, Error().stack));
        }
    }

    _monitor(ref, watcher) {
        this[monitors].set(ref, watcher);
    }

    _demonitor(ref) {
        this[monitors].delete(ref);
    }

    _notifyMonitors(reason) {
        const pid = this.self();
        for (let [ref, monitor] of this[monitors]) {
            this.send(monitor, t(DOWN, ref, 'process', pid, reason));
        }
    }

    destroy(reason) {
        this._dead = true;
        this._notifyMonitors(reason);
        this._notifyLinks(reason);

        const inbox = this[mb];

        this[mb] = null;
        this[pid] = null;
        this[node] = null;
        this[links] = null;

        inbox.clear(reason);
    }

    get [trap_exit]() {
        return this[flags].get(trap_exit);
    }

    set [trap_exit](value) {
        this[flags].set(trap_exit, value);
    }

    _deliver(message) {
        this._log('_deliver() : message : %o', message);
        if (!this._dead) {
            if (isExitMessage(message) && !this[trap_exit]) {
                if (message.length === 3) {
                    this.die(message[message.length - 1]);
                } else if (message.length === 4) {
                    this.die(message[message.length - 2]);
                }
            } else {
                try {
                    this[mb].push(message);
                    this._log('_deliver() : mb : %o', this[mb]);
                } catch (err) {
                    this._log('_deliver() : undeliverable : %o', err);
                }
            }
        } else {
            this._log('_deliver() : DEAD');
        }
    }

    [forward](operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this[node][operation](...args);
            } catch (err) {
                this._log('forward(%o, %o) : error : %o', operation, name, err);
            }
        };
    }

    [forwardWithSelf](operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this[node][operation](this, ...args);
            } catch (err) {
                this._log(
                    'forwardWithSelf(%o, %o) : error : %o',
                    operation,
                    name,
                    err
                );
            }
        };
    }

    [forwardWithPid](operation, name = operation) {
        this[name] = (...args) => {
            try {
                return this[node][operation](this.self(), ...args);
            } catch (err) {
                this._log(
                    'forwardWithPid(%o, %o) : error : %o',
                    operation,
                    name,
                    err
                );
            }
        };
    }

    self() {
        return this[pid];
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

        predicates = predicates.map(compile);

        const [, message, _predicate] = await this[mb].pop(
            ...predicates,
            timeout
        );

        this[lastMessage] = message;

        return message;
    }

    async receiveWithPredicate(...predicates) {
        let timeout = Infinity;

        if (typeof predicates[predicates.length - 1] === 'number') {
            timeout = predicates.pop();
        }

        predicates = predicates.map(compile);

        const [, message, predicate] = await this[mb].pop(
            ...predicates,
            timeout
        );

        return [message, predicate];
    }

    exit(pid, reason) {
        if (!Pid.isPid(pid)) {
            reason = pid;
            pid = this[pid];
        }
        return this[node].exit(pid, reason);
    }

    __drain(reason) {
        if (this[mb]) {
            this[mb].clear(reason);
        }
    }

    get dead() {
        return this._dead;
    }

    get [status]() {
        if (this._dead) {
            return 'exiting';
        } else if (this[mb].pending > 0) {
            return 'waiting';
        } else {
            return 'running';
        }
    }

    _processInfo() {
        if (this._dead) {
            return {
                status: this[status],
                links: [],
                messageQueueLength: 0,
                messages: [],
                monitors: [],
            };
        } else {
            return {
                status: this[status],
                links: Array.from(this[links]),
                messageQueueLength: this[mb].length,
                messages: Array.from(this[mb]),
                monitors: Array.from(this[monitors].values()),
            };
        }
    }
}
