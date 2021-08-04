import debug from 'debug';
import { OTPError } from './error';
import { match, compile } from './matching';
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

const isExitMessage = match(
    [EXIT, _, _],
    [EXIT, _, _, _]
);

export class Context {
    constructor(owner) {
        this[node] = owner;
        this[mb] = new MessageBox();
        this[pid] = owner.pid();
        this[links] = new Set();
        this[monitors] = new Map();
        this[flags] = new Map();

        this[forward]('deliver', 'send');
        this[forward]('demonitor');
        this[forward]('ref');
        this[forward]('spawn');
        this[forward]('whereis');
        this[forwardWithSelf]('spawnLink');
        this[forwardWithPid]('monitor');
        this[forwardWithPid]('register');
        this[forwardWithPid]('unregister');

        const logComponents = [
            'otpjs',
            this[pid].toLowerCase()
        ]
        this.log = debug(logComponents.join(':'));
        this._log = this.log.extend('context');

        this.death = new Promise(
            resolve => this.die = (reason) => {
                this.log('die(%o) : lastMessage : %o', reason, this[lastMessage]);
                resolve(reason);
            }
        );

        this.death.then(
            (reason) => {
                this.dead = true;
                this.destroy(reason);
            }
        );
    }

    link(other) {
        this[links].add(other.self());
        other[links].add(this.self());
    }

    processFlag(flag, value) {
        if (flag in this) {
            this[flag] = value;
        } else {
            throw new OTPError(['unknown_flag', flag]);
        }
    }

    notify(reason) {
        const pid = this.self();
        this[links].forEach(
            link => this.send(
                link,
                [
                    EXIT,
                    pid,
                    reason,
                    Error().stack
                ]
            )
        );
    }

    notifyMonitors(reason) {
        const pid = this.self();
        this[monitors].forEach(
            monitor => this.send(
                monitor,
                [
                    DOWN,
                    pid,
                    reason
                ]
            )
        )
    }

    destroy(reason) {
        this.notify(reason);

        this[mb].clear();

        this[mb] = null;
        this[pid] = null;
        this[node] = null;
        this[links] = null;
    }

    get [trap_exit]() {
        return this[flags].get(trap_exit);
    }

    set [trap_exit](value) {
        this[flags].set(trap_exit, value);
    }

    _deliver(message) {
        this._log('_deliver(%o)', message);
        if (!this.dead) {
            if (
                isExitMessage(message)
                && !this[trap_exit]
            ) {
                if (message.length === 3) {
                    this.die(message[message.length - 1]);
                } else if (message.length === 4) {
                    this.die(message[message.length - 2]);
                }
            } else {
                try {
                    this[mb].push(message);
                } catch (err) {
                    this._log('_deliver(%o) : undeliverable : %o', message, err);
                }
            }
        }
    }

    [forward](operation, name = operation) {
        this[name] = (...args) => {
            return this[node][operation](
                ...args
            );
        }
    }

    [forwardWithSelf](operation, name = operation) {
        this[name] = (...args) => {
            return this[node][operation](
                this,
                ...args
            );
        }
    }

    [forwardWithPid](operation, name = operation) {
        this[name] = (...args) => {
            return this[node][operation](
                this.self(),
                ...args
            );
        }
    }

    self() {
        return this[pid];
    }

    send(to, message) {
        return node.deliver(to, message);
    }

    async receive(predicates, timeout) {
        if (
            typeof timeout === 'undefined'
            && typeof predicates === 'number'
        ) {
            timeout = predicates;
            predicates = [_];
        } else if (
            typeof timeout === 'undefined'
            && typeof predicates === 'undefined'
        ) {
            predicates = [_];
            timeout = Infinity;
        }

        if (!Array.isArray(predicates)) {
            predicates = [predicates]
        }

        predicates = predicates.map(compile);

        const [, message, _predicate] = await this[mb].pop(
            predicates,
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
            predicates,
            timeout
        );

        return [message, predicate];
    }
}
