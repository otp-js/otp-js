import * as Symbols from './symbols';
import { t, OTPError } from '@otpjs/types';
import debug from 'debug';

const defaultLogger = debug('otpjs:core:message-box');
const defaultPredicate = () => true;
const { ok, already_receiving, timeout } = Symbols;

// [1]
// index++ is the same as index += 1
export class MessageBox extends Array {
    #log;
    #pending;

    constructor(log = defaultLogger, ...args) {
        super(...args);

        this.#log = log;

        this.#pending = null;
    }

    get pending() {
        return this.length;
    }

    get isReceiving() {
        return this.#pending ? true : false;
    }

    clear(reason) {
        this.splice(0, this.length);

        if (this.#pending) {
            const [_resolve, reject, _predicate] = this.#pending;
            reject(reason);
            this.#pending = null;
        }
    }
    push(message) {
        this.#log('push(message: %o)', message);
        if (this.#pending) {
            const [resolve, _reject, predicate] = this.#pending;
            try {
                if (predicate(message)) {
                    this.#pending = null;
                    return resolve(t(ok, message));
                }
            } catch (err) {
                this.#log('push(predicate: %o, error: %o)', predicate, err);
            }

            // If we get here, we didn't bail out above, so the message
            // is unhandled
            super.push(message);
        } else {
            super.push(message);
        }
    }
    async pop(predicate, timeout) {
        if (this.#pending) {
            throw OTPError(already_receiving);
        }

        if (arguments.length === 0) {
            predicate = defaultPredicate;
            timeout = Infinity;
        } else if (arguments.length === 1) {
            if (typeof predicate === 'number') {
                timeout = predicate;
                predicate = defaultPredicate;
            } else {
                timeout = Infinity;
            }
        }

        return new Promise((innerResolve, innerReject) => {
            const resolve = (result) => {
                this.#log('pop(resolved: %o)', result);
                innerResolve(result);
            };
            const reject = (reason) => {
                this.#log('pop(rejected: %o)', reason);
                innerReject(reason);
            };
            if (this.length > 0) {
                for (let index = 0; index < this.length; index++) {
                    try {
                        const message = this[index];
                        if (predicate(message)) {
                            return resolve(t(ok, this.#consume(index)));
                        }
                    } catch (err) {
                        continue;
                    }
                }

                this.#defer(resolve, reject, predicate, timeout);
            } else {
                this.#defer(resolve, reject, predicate, timeout);
            }
        });
    }

    #defer(resolve, reject, predicate, timeout) {
        let timer = null;
        let record = null;

        if (timeout !== Infinity) {
            let originalResolve = resolve;
            resolve = (...args) => {
                this.#pending = null;
                clearTimeout(timer);
                originalResolve(...args);
            };

            let originalReject = reject;
            reject = (...args) => {
                this.#pending = null;
                clearTimeout(timer);
                originalReject(...args);
            };

            timer = setTimeout(() => {
                reject(OTPError(Symbols.timeout));
            }, timeout);

            record = t(resolve, reject, predicate);
        } else {
            record = t(resolve, reject, predicate);
        }

        this.#pending = record;
    }
    #consume(index) {
        const [message] = this.splice(index, 1);
        return message;
    }
}
