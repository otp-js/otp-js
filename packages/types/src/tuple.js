import inspect from 'inspect-custom-symbol';

export function Tuple(...elements) {
    if (!(this instanceof Tuple)) {
        return new Tuple(...elements);
    }
    const size = elements.length;

    for (let i = 0; i < size; ++i) {
        Reflect.defineProperty(this, i, {
            get() {
                return elements[i];
            },
            set(value) {
                elements[i] = value;
            },
            configurable: false,
        });
    }

    Reflect.defineProperty(this, 'size', {
        get() {
            return size;
        },
        configurable: false,
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
    });
}

Tuple.prototype[Symbol.iterator] = function* () {
    for (let i = 0; i < this.size; i++) {
        yield this.get(i);
    }
};

Tuple.prototype[inspect] = function (depth, options, inspect) {
    if (depth < 0) {
        return options.stylize('[Tuple]', 'special');
    }

    const newOptions = {
        ...options,
        depth: options.depth === null ? null : options.depth - 1,
    };

    const prefix = `{ `;
    const postfix = ` }`;

    let result = prefix;
    let elements = [];
    let firstDone = false;
    for (let i = 0; i < this.size && i < options.maxArrayLength; i++) {
        if (firstDone) {
            result += ', ';
        }
        result += inspect(this.get(i), newOptions);
        firstDone = true;
    }

    if (this.size > options.maxArrayLength) {
        const remaining = this.size - options.maxArrayLength;
        result += ` ... ${remaining} more elements`;
    }

    result += postfix;
    return result;
};

Tuple.isTuple = function (value) {
    return value instanceof Tuple;
};

export const t = Tuple;
export const tuple = Tuple;
