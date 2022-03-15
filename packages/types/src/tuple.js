import inspect from 'inspect-custom-symbol';
import debug from 'debug';

const log = debug('otpjs:types:tuple');

export function Tuple(...elements) {
    if (!(this instanceof Tuple)) {
        return new Tuple(...elements);
    }
    const size = elements.length;

    Reflect.defineProperty(this, 'size', {
        get() {
            return size;
        },
        configurable: false,
        enumerable: false,
    });
    Reflect.defineProperty(this, 'get', {
        value: function get(index) {
            if (index >= size) {
                throw RangeError(
                    `accessed invalid index ${index} of tuple<${size}>`
                );
            }
            return elements[index];
        },
        configurable: false,
        writable: false,
        enumerable: false,
    });
    Reflect.defineProperty(this, 'set', {
        value: function set(index, value) {
            if (index >= size) {
                throw RangeError(
                    `accessed invalid index ${index} of tuple<${size}>`
                );
            }
            elements[index] = value;
        },
        configurable: false,
        writable: false,
        enumerable: false,
    });

    return new Proxy(this, {
        get(object, key, value) {
            if (typeof key === 'string' && /^[0-9]+$/.test(key)) {
                const index = parseInt(key);
                if (index >= 0 && index < size) {
                    return elements[index];
                } else {
                    throw RangeError(
                        `accessed invalid index (${index}) on tuple`
                    );
                }
            } else if (key in object) {
                return object[key];
            } else {
                return undefined;
            }
        },
        set(object, key, value) {
            if (typeof key === 'string' && /^[0-9]+$/.test(key)) {
                const index = parseInt(key);
                if (index >= 0 && index < size) {
                    elements[index] = value;
                    return true;
                } else {
                    throw RangeError(
                        `setting invalid index (${index}) on tuple`
                    );
                }
            } else if (key in object) {
                if (typeof key === 'symbol') {
                    key = String(key);
                }
                throw RangeError(`writing to read-only value ${key} on tuple`);
            } else {
                if (typeof key === 'symbol') {
                    key = String(key);
                }
                throw RangeError(`accessed invalid key ${key} on tuple`);
            }
        },
        getPrototypeOf(object) {
            return Reflect.getPrototypeOf(object);
        },
    });
}

Tuple.prototype[Symbol.iterator] = function* () {
    for (let i = 0; i < this.size; i++) {
        yield this.get(i);
    }
};
Tuple.prototype.then = undefined;

Tuple.prototype[inspect] = function (depth, options, inspect) {
    if (depth < 0) {
        return options.stylize('[Tuple]', 'special');
    }

    const newOptions = {
        ...options,
        depth: options.depth === null ? null : options.depth - 1,
    };

    const prefix = `{`;
    const postfix = ` }`;

    let result = prefix;
    let firstDone = false;
    for (let i = 0; i < this.size && i < options.maxArrayLength; i++) {
        if (firstDone) {
            result += ', ';
        } else {
            result += ' ';
        }
        result += inspect(this.get(i), newOptions);
        firstDone = true;
    }

    if (this.size > options.maxArrayLength) {
        const remaining = this.size - options.maxArrayLength;
        result += ` ... ${remaining} more items`;
    }

    result += postfix;
    return result;
};

Tuple.prototype.toJSON = function () {
    return ['$otp.tuple', Array.from(this)];
};

Tuple.prototype[Symbol.toStringTag] = function () {
    return 'Tuple';
};

Tuple.prototype.$$typeof = 'object';

Tuple.isTuple = function (value) {
    return value instanceof Tuple;
};

export const t = Tuple;
export const tuple = Tuple;
