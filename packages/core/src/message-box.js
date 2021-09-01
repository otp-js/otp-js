import { ok } from './symbols';
import debug from 'debug';

const defaultLogger = debug('otpjs:core:message-box');

const resolvers = Symbol();

// [1]
// index++ is the same as index += 1
export class MessageBox extends Array {
    constructor(log = defaultLogger, ...args) {
        super(...args);

        this._log = log;

        this[resolvers] = [];
    }

    get pending() {
        return this[resolvers].length;
    }

    clear(reason) {
        this.splice(
            0,
            this.length
        );

        const droppedReceivers = this[resolvers].splice(
            0,
            this[resolvers].length
        );

        for (let [_resolve, reject, _predicate] of droppedReceivers) {
            reject(reason);
        }
    }
    push(message) {
        if (this[resolvers].length > 0) {
            let index = 0;
            for (let [_resolve, _reject, predicates] of this[resolvers]) {
                for (let predicate of predicates) {
                    try {
                        if (predicate(message)) {
                            const [[
                                resolve,
                                _reject,
                                _predicates
                            ]] = this[resolvers].splice(index, 1);
                            return resolve([ok, message, predicate]);
                        }
                    } catch (err) {
                        continue;
                    }
                }
                index++;
            }

            // If we get here, we didn't bail out above, so the message
            // is unhandled
            super.push(message);
        } else {
            super.push(message);
        }
    }
    async pop(...predicates) {
        let timeout = Infinity;
        if (predicates.length > 0) {
            if (typeof predicates[predicates.length - 1] === 'number') {
                timeout = predicates.pop();
            }
        }

        if (predicates.length === 0) {
            predicates.push(() => true);
        }

        this._log('pop() : predicates : %o', predicates);
        this._log('pop() : timeout : %o', timeout);

        return new Promise((innerResolve, innerReject) => {
            const resolve = (result) => {
                this._log('pop() : resolved : %o', result);
                innerResolve(result);
            };
            const reject = (reason) => {
                this._log('pop() : rejected : %o', reason);
                innerReject(reason);
            };
            if (this.length > 0) {
                for (let index = 0; index < this.length; index++) {
                    const message = this[index];

                    for (let predicate of predicates) {
                        try {
                            if (predicate(message)) {
                                return resolve([
                                    ok,
                                    this._consume(index),
                                    predicate
                                ]);
                            }
                        } catch (err) {
                            continue;
                        }
                    }
                }

                this._defer(
                    resolve,
                    reject,
                    predicates,
                    timeout
                );
            } else {
                this._defer(
                    resolve,
                    reject,
                    predicates,
                    timeout
                );
            }
        })
    }

    _defer(resolve, reject, predicate, timeout) {
        let timer = null;
        let record = null;

        if (timeout !== Infinity) {
            let originalResolve = resolve;
            resolve = (...args) => {
                clearTimeout(timer);
                originalResolve(...args);
            };

            let originalReject = reject;
            reject = (...args) => {
                clearTimeout(timer);
                originalReject(...args);
            }

            timer = setTimeout(() => {
                reject(Error('timeout'))

                const index = this[resolvers].indexOf(record);
                if (index >= 0) {
                    this[resolvers].splice(index, 1);
                }
            }, timeout);

            record = [
                resolve,
                reject,
                predicate,
            ];
        } else {
            record = [
                resolve,
                reject,
                predicate,
            ];
        }

        this._log('_defer() : record : %o', record);
        this[resolvers].push(record);
    }
    _consume(index) {
        const [message] = this.splice(index, 1);
        return message;
    }
}
