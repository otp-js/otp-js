import inspect from 'inspect-custom-symbol';
import { nil } from './symbols';

export function List(head, tail = nil) {
    if (!(this instanceof List)) {
        return new List(head, tail);
    }

    Object.defineProperty(this, 'head', {
        get() {
            return head;
        },
        configurable: false,
    });
    Object.defineProperty(this, 'tail', {
        get() {
            return tail;
        },
        configurable: false,
    });
}

List.prototype.length = function () {
    let c = 0;
    let node = this;
    while (List.isList(node) && node != nil) {
        c++;
        node = node.tail;
    }
    return c;
};

List.prototype[Symbol.iterator] = function* () {
    let node = this;
    do {
        yield node.head;
        node = node.tail;
    } while (node instanceof List);
};

List.prototype[inspect] = function inspect(
    depth,
    { drewPrefix, ...options },
    inspect
) {
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
    } else if (node != nil) {
        result += ` | ${inspect(node, newOptions)}`;
    }

    if (!drewPrefix) {
        result += postfix;
    }

    return result;
};

export function l(...elements) {
    return List.from(...elements);
}
export function il(...elements) {
    if (elements.length === 0) {
        return undefined;
    } else {
        let tail = elements.pop();
        for (let i = elements.length - 1; i >= 0; i--) {
            const head = elements[i];
            tail = List(head, tail);
        }
        return tail;
    }
}
export const cons = List;
export const list = l;

Object.defineProperty(list, 'nil', {
    configurable: false,
    writable: false,
    value: nil,
});

Object.defineProperty(list, 'isList', {
    configurable: false,
    writable: false,
    value: function (value) {
        return value instanceof List || value === nil;
    },
});
Object.defineProperty(List, 'nil', {
    configurable: false,
    writable: false,
    value: nil,
});

Object.defineProperty(List, 'isList', {
    configurable: false,
    writable: false,
    value: function (value) {
        return value instanceof List || value === nil;
    },
});
Object.defineProperty(List, 'from', {
    configurable: false,
    writable: false,
    value: function (...elements) {
        if (elements.length === 0) {
            return nil;
        } else {
            let tail = nil;
            for (let i = elements.length - 1; i >= 0; i--) {
                const head = elements[i];
                tail = List(head, tail);
            }
            return tail;
        }
    },
});
