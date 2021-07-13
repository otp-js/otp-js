import {ok} from './symbols';

const resolvers = Symbol();

function attempt(predicates, message) {
    for (let index = 0; index < predicates.length; index++) {
        try {
            const predicate = predicates[index];
            return predicate(message);
        } catch (err) {
        }
    }

    return false;
}

// [1]
// index++ is the same as index += 1
export class MessageBox extends Array {
    constructor(...args) {
        super(...args);

        this[resolvers] = [];
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
            const index = this[resolvers].findIndex(
                ([
                    _resolve,
                    _reject,
                    predicate
                ]) => attempt(predicate,message)
            );

            if (index >= 0) {
                const [[
                    resolve,
                    _reject,
                    predicate
                ]] = this[resolvers].splice(index, 1);
                resolve([ ok, message, predicate ]);
            } else {
                super.push(message);
            }
        } else {
            super.push(message);
        }
    }
    async pop(predicates = () => true, timeout = Infinity) {
        if (typeof predicates === 'number') {
            timeout = predicates;
            predicates = () => true;
        }

        if (!Array.isArray(predicates)) {
            predicates = [predicates];
        }

        return new Promise((resolve, reject) => {
            if (this.length > 0) {
                for (let index = 0; index < this.length; index++) {
                    const message = this[index];

                    for (let predicate of predicates) {
                        if (predicate(message)) {
                            return resolve([
                                ok,
                                this._consume(index),
                                predicate
                            ]);
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
        const record = [
            resolve,
            reject,
            predicate,
        ];

        if (timeout !== Infinity) {
            let originalResolve = resolve;
            record[0] = resolve = (...args) => {
                clearTimeout(timer);
                originalResolve(...args);
            };

            let originalReject = reject;
            record[1] = reject = (...args) => {
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
        }

        this[resolvers].push(record);
    }
    _consume(index) {
        const [message] = this.splice(index, 1);
        return message;
    }
}
