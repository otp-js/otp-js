import inspect from 'inspect-custom-symbol';
import { nil } from './symbols';

class _List {
    #head;
    #tail = nil;

    constructor(head, tail) {
        this.#head = head;
        this.#tail = tail;
    }

    length() {
        let c = 0;
        let node = this;
        while (l.isList(node) && node != nil) {
            c++;
            node = node.#tail;
        }
        return c;
    }

    static get nil() {
        return nil;
    }

    get head() {
        return this.#head;
    }

    get tail() {
        return this.#tail;
    }

    *[Symbol.iterator]() {
        let node = this;
        do {
            yield node.#head;
            node = node.#tail;
        } while (node instanceof _List);
    }

    [inspect](depth, { drewPrefix, ...options }, inspect) {
        if (depth < 0) {
            return options.stylize('[List]', 'special');
        }

        const newOptions = {
            ...options,
            drewPrefix: false,
            depth: options.depth === null ? null : options.depth - 1,
        };

        const prefix = '[ ';
        const postfix = ' ]';

        let result = '';

        if (!drewPrefix) {
            result += prefix;
        }

        result += inspect(this.#head, newOptions);

        if (List.isList(this.#tail) && this.#tail !== nil) {
            const newOptions = {
                ...options,
                drewPrefix: true,
                depth: options.depth === null ? null : options.depth,
            };
            result += `, ${inspect(this.#tail, newOptions)}`;
        } else if (this.#tail !== nil) {
            const newOptions = {
                ...options,
                drewPrefix: true,
                depth: options.depth === null ? null : options.depth,
            };
            result += ` | ${inspect(this.#tail, newOptions)}`;
        }

        if (!drewPrefix) {
            result += postfix;
        }

        return result;
    }
}
export function List(...elements) {
    if (elements.length === 0) {
        return nil;
    } else {
        let tail = nil;
        for (let i = elements.length - 1; i >= 0; i--) {
            const head = elements[i];
            tail = new _List(head, tail);
        }
        return tail;
    }
}
export function ImproperList(...elements) {
    let tail = elements.pop();
    let i = elements.length - 1;
    do {
        const head = elements[i--];
        tail = new _List(head, tail);
    } while (i >= 0);
    return tail;
}
List.isList = function (value) {
    return value instanceof _List || value === nil;
};
ImproperList.isList = function (value) {
    return value instanceof _List || value === nil;
};
export const l = List;
export const il = ImproperList;
export const list = List;
export const improperList = ImproperList;
