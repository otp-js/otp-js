import * as Symbols from './symbols';
import { t, OTPError } from '@otpjs/types';
import debug from 'debug';

const { ok, already_receiving } = Symbols;
const nothing = Symbol('nothing');

const defaultLogger = debug('otpjs:core:message-box');
const defaultPredicate = (message) => Promise.resolve(t(ok, message));
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
        return !!this.#pending;
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
        if (this.#pending) {
            this.#log('push(message: %o, #pending: %o)', message, this.#pending);
            const [resolve, _reject, evaluator] = this.#pending;
            try {
                const result = evaluator(message);
                this.#log('push(evaluate: %o, message: %o, result: %o)', evaluator, message, result);
                if (result !== false) {
                    this.#pending = null;
                    return resolve(result);
                }
            } catch (err) {
                this.#log('push(predicate: %o, error: %o)', evaluator, err);
            }

            // If we get here, we didn't bail out above, so the message
            // is unhandled
            super.push(message);
        } else {
            super.push(message);
        }
    }

    async pop(evaluator, timeout) {
        if (this.#pending) {
            throw OTPError(already_receiving);
        }

        if (arguments.length === 0) {
            evaluator = defaultPredicate;
            timeout = Infinity;
        } else if (arguments.length === 1) {
            if (typeof evaluator === 'number') {
                timeout = evaluator;
                evaluator = defaultPredicate;
            } else {
                timeout = Infinity;
            }
        }

        this.#log('pop(evaluate: %o, timeout: %o)', evaluator, timeout);

        return new Promise((resolve, reject) => {
            const innerResolve = (result) => {
                this.#log('pop(resolved: %o)', result);
                resolve(result);
            };
            const innerReject = (reason) => {
                this.#log('pop(rejected: %o)', reason);
                reject(reason);
            };
            if (this.length > 0) {
                for (let index = 0; index < this.length; index++) {
                    try {
                        const message = this[index];
                        const result = evaluator(message);
                        this.#log(
                            'pop(evaluate: %o, message: %o, result: %o)',
                            evaluator,
                            message,
                            result
                        );
                        if (result !== false) {
                            this.#consume(index);
                            return innerResolve(result);
                        }
                    } catch (err) {
                        continue;
                    }
                }

                this.#defer(innerResolve, innerReject, evaluator, timeout);
            } else {
                this.#defer(innerResolve, innerReject, evaluator, timeout);
            }
        });
    }

    #defer(resolve, reject, evaluator, timeout) {
        let timer = null;
        let record = null;

        if (timeout !== Infinity) {
            const originalResolve = resolve;
            resolve = (...args) => {
                this.#pending = null;
                this.#log('#defer(timer: %o)', timer);
                clearTimeout(timer);
                originalResolve(...args);
            };

            const originalReject = reject;
            reject = (...args) => {
                this.#pending = null;
                this.#log('#defer(timer: %o)', timer);
                clearTimeout(timer);
                originalReject(...args);
            };

            timer = setTimeout(() => {
                this.#log('#defer(timeout)');
                reject(OTPError(Symbols.timeout));
            }, timeout);

            record = t(resolve, reject, evaluator);
        } else {
            record = t(resolve, reject, evaluator);
        }

        this.#log('#defer(record: %o)', record);

        this.#pending = record;
    }

    #consume(index) {
        const [message] = this.splice(index, 1);
        return message;
    }
}
