import debug from 'debug';
import { MessageBox } from './message-box.js';

const log = debug('otpjs:core:context');

const node = Symbol();
const mb = Symbol();
const pid = Symbol();
const forward = Symbol();
const forwardWithSelf = Symbol();
const links = Symbol();

export class Context {
    constructor(owner) {
        this[node] = owner;
        this[mb] = new MessageBox();
        this[pid] = owner.pid();
        this[links] = new Set();

        this[forward]('ref');
        this[forward]('deliver', 'send')
        this[forward]('spawn');
        this[forwardWithSelf]('spawnLink');
        this[forward]('register')
        this[forward]('unregister')
        this[forward]('whereis');

        this.death = new Promise(
            resolve => this.die = resolve
        );

        this.death.then(
            (reason) => this.notify(reason)
        );
        this.death.then(
            (reason) => this.destroy(reason)
        );
    }

    link(other) {
        this[links].add(other.self());
        other[links].add(this.self());
    }

    notify(reason) {
        const pid = this.self();
        const exit = true;
        this[links].forEach(
            link => this.send(
                link,
                {
                    exit,
                    pid,
                    reason
                }
            )
        );
    }

    destroy(reason) {
        this[mb] = null;
        this[pid] = null;
        this[node] = null;
        this[links] = null;
    }

    _deliver(message) {
        log('_deliver() : this[mb].push(%o)', message)
        this[mb].push(message);
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

    self() {
        return this[pid];
    }

    send(to, message) {
        return node.deliver(to, message);
    }

    receive(predicate, timeout) {
        return this[mb].pop(predicate, timeout);
    }
}
