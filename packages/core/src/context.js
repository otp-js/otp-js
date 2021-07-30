import debug from 'debug';
import { OTPError } from './error';
import { match, compile } from './matching';
import { MessageBox } from './message-box.js';
import { EXIT, _, trapExit } from './symbols';

const log = debug('otpjs:core:context');

const node = Symbol();
const mb = Symbol();
const pid = Symbol();
const forward = Symbol();
const forwardWithSelf = Symbol();
const forwardWithPid = Symbol();
const links = Symbol();
const flags = Symbol();

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
        this[flags] = new Map();

        this[forward]('ref');
        this[forward]('deliver', 'send')
        this[forward]('spawn');
        this[forwardWithSelf]('spawnLink');
        this[forwardWithPid]('register')
        this[forwardWithPid]('unregister')
        this[forward]('whereis');

        this.death = new Promise(
            resolve => this.die = resolve
        );

        this.death.then(
            (reason) => {
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
                    reason
                ]
            )
        );
    }

    destroy(reason) {
        this[mb].clear();

        this[mb] = null;
        this[pid] = null;
        this[node] = null;
        this[links] = null;
    }

    get [trapExit]() {
        return this[flags].get(trapExit);
    }

    set [trapExit](value) {
        this[flags].set(trapExit, value);
    }

    _deliver(message) {
        if (
            isExitMessage(message)
            && !this[trapExit]
        ) {
            const self = this.self();
            this.die(message.reason);
            throw new OTPError([EXIT, self, message.reason]);
        } else {
            try {
                this[mb].push(message);
            } catch (err) {
                log('_deliver(%o) : undeliverable : %o', message, err);
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

        return message;
    }

    async receiveWithPredicate(...predicates) {
        let timeout = Infinity;

        if (typeof predicates[predicate.length - 1] === 'number') {
            timeout = predicates.pop();
        }

        predicates = predicates.map(compile);

        const [, message, predicate] = this[mb].pop(
            predicates,
            timeout
        );

        return [message, predicate];
    }
}
