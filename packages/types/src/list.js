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

        let node = this;
        let firstDone = false;
        let count = 0;
        while (
            List.isList(node) &&
            node != nil &&
            count++ < options.maxArrayLength
        ) {
            if (firstDone) {
                result += ', ';
            }
            result += `${inspect(node.head, newOptions)}`;
            node = node.tail;
            firstDone = true;
        }

        if (List.isList(node) && node != nil) {
            result += `, ... ${node.length()} more elements`;
        } else {
            result += `|${inspect(node, newOptions)}`;
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
Object.defineProperty(List, 'nil', {
    value: nil,
    writable: false,
    configurable: false,
});
ImproperList.isList = function (value) {
    return value instanceof _List || value === nil;
};
Object.defineProperty(ImproperList, 'nil', {
    value: nil,
    writable: false,
    configurable: false,
});
export const l = List;
export const il = ImproperList;
export const list = List;
export const improperList = ImproperList;
