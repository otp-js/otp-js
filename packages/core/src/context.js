import debug from 'debug';
import { MessageBox } from './message-box.js';

const log = debug('otpjs:core:context');

const node = Symbol();
const mb = Symbol();
const pid = Symbol();
const forward = Symbol();

export class Context {
    constructor(owner) {
        this[node] = owner;
        this[mb] = new MessageBox();
        this[pid] = owner.pid();

        this[forward]('ref');
        this[forward]('deliver', 'send')
        this[forward]('spawn');
        this[forward]('spawnLink');
        this[forward]('register')
        this[forward]('unregister')
        this[forward]('whereis');

        this.death = new Promise(resolve => this.die = resolve);
    }

    destroy() {
        log('destroy()');
        this[mb] = null;
        this[pid] = null;
        this[node] = null;
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
