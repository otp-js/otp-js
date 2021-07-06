const resolvers = Symbol();

export class MessageBox extends Array {
    constructor(...args) {
        super(...args);

        this[resolvers] = [];
    }

    push(message) {
        if (this[resolvers].length > 0) {
            const index = this[resolvers].findIndex(
                ([
                    _resolve,
                    _reject,
                    predicate
                ]) => predicate(message)
            );

            if (index >= 0) {
                const [[
                    resolve,
                    _reject,
                    _predicate
                ]] = this[resolvers].splice(index, 1);
                resolve(message);
            } else {
                super.push(message);
            }
        } else {
            super.push(message);
        }
    }

    async pop(predicate = () => true, timeout = Infinity) {
        if (typeof predicate === 'number') {
            timeout = predicate;
            predicate = () => true;
        }

        return new Promise((resolve, reject) => {
            if (this.length > 0) {
                const index = this.findIndex(predicate);
                if (index >= 0) {
                    resolve(
                        this._consume(index)
                    )
                } else {
                    this._defer(
                        resolve,
                        reject,
                        predicate,
                        timeout
                    );
                }
            } else {
                this._defer(
                    resolve,
                    reject,
                    predicate,
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
            timer = setTimeout(() => {
                reject(Error('timeout'))

                const index = this[resolvers].indexOf(record);
                if (index >= 0) {
                    this[resolvers].splice(index, 1);
                }
            }, timeout);
            record[0] = resolve = (...args) => {
                clearTimeout(timer)
                originalResolve(...args);
            };
        }

        this[resolvers].push(record);
    }

    _consume(index) {
        const [message] = this.splice(index, 1);
        return message;
    }
}
