import inspect from 'inspect-custom-symbol';

class _Tuple {
    #size;
    #elements;

    constructor(...args) {
        this.#size = args.length;
        this.#elements = new Array(this.#size);

        for (let i = 0; i < this.#size; i++) {
            this.#elements[i] = args[i];
        }
    }

    get(index) {
        if (index >= this.#size) {
            throw RangeError(
                `accessed invalid index ${index} of tuple<${this.#size}>`
            );
        }
        return this.#elements[index];
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.#size; i++) {
            yield this.#elements[i];
        }
    }

    get size() {
        return this.#size;
    }

    [inspect](depth, options, inspect) {
        if (depth < 0) {
            return options.stylize('[Tuple]', 'special');
        }

        const newOptions = {
            ...options,
            depth: options.depth === null ? null : options.depth - 1,
        };

        if (this.#size < options.maxArrayLength) {
            return `{ ${this.#elements
                .slice(0, options.maxArrayLength)
                .map((value) => inspect(value, newOptions))
                .join(', ')} }`;
        } else {
            return `{ ${this.#elements
                .slice(0, options.maxArrayLength)
                .map((value) => inspect(value, newOptions))
                .join(', ')} ... ${
                this.#size - options.maxArrayLength
            } more elements }`;
        }
    }
}

export function Tuple(...args) {
    return new _Tuple(...args);
}

Tuple.isTuple = function (value) {
    return value instanceof _Tuple;
};

export const t = Tuple;
export const tuple = Tuple;
