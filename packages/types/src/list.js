import inspect from 'inspect-custom-symbol';
import debug from 'debug';
import { t } from './tuple';

const log = debug('otpjs:types:list');

const hidden = new WeakMap();
const nil = Object(Symbol.for('nil'));

_bind(nil);

export function List(head, tail) {
    if (!(this instanceof List)) {
        return new List(head, tail);
    }

    _bind(this, head, tail);
}

function _bind(obj, head, tail, empty = false) {
    Reflect.setPrototypeOf(obj, List.prototype);
    Reflect.defineProperty(obj, 'head', {
        get() {
            return head;
        },
        configurable: false,
    });
    Reflect.defineProperty(obj, 'tail', {
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

List.prototype.map = async function (operation) {
    let node = this;
    let copy = nil;

    while (List.isList(node) && node != nil) {
        copy = cons(await operation(car(node)), copy);
        node = cdr(node);
    }

    return copy.reverse();
};

List.prototype.filter = async function (operation) {
    let node = this;
    let copy = nil;

    while (List.isList(node) && node != nil) {
        const item = car(node);

        if (await operation(item)) {
            copy = cons(item, copy);
        }

        node = cdr(node);
    }

    return copy.reverse();
};

List.prototype.push = function (value) {
    if (this === nil) {
        return cons(value, nil);
    }

    let node = this;
    let previous = nil;
    let stack = nil;

    while (List.isList(node) && node != nil) {
        stack = cons(node.head, stack);
        previous = node;
        node = node.tail;
    }

    if (!List.isList(node)) {
        throw Error('pushed to improper list');
    }

    stack = cons(value, stack);

    return stack.reverse();
};

List.prototype.reverse = function () {
    let reversed = nil;
    let node = this;

    while (List.isList(node) && node != nil) {
        reversed = cons(node.head, reversed);
        node = node.tail;
    }

    return reversed;
};

List.prototype.replaceWhere = function (predicate, nextValue, insert = false) {
    let node = this;
    let stack = nil;
    let replaced = false;

    while (List.isList(node) && node != nil) {
        const result = predicate(node.head);
        log(
            'replaceWhere(predicate: %o, node.head: %o, result: %o, stack: %o)',
            predicate,
            node.head,
            result,
            stack
        );

        if (predicate(node.head)) {
            stack = cons(nextValue, stack);
            replaced = true;
            node = node.tail;
            break;
        } else {
            stack = cons(node.head, stack);
            node = node.tail;
        }
    }

    if (!replaced && insert) {
        log('replaceWhere(insert: %o, stack: %o)', nextValue, stack);
        stack = cons(nextValue, stack);
    }

    while (List.isList(stack) && stack != nil) {
        log(
            'replaceWhere(cons: ([%o|%o]), node: %o)',
            node.head,
            stack.tail,
            node
        );
        node = cons(stack.head, node);
        stack = stack.tail;
    }

    return node;
};

List.prototype.includes = function (value) {
    let node = this;

    while (l.isList(node) && node != nil) {
        if (node.head === value) {
            return true;
        } else {
            node = node.tail;
        }
    }

    return false;
};

List.prototype.find = function (predicate) {
    let node = this;

    while (List.isList(node) && node != nil) {
        if (predicate(node.head)) {
            return node.head;
        } else {
            node = node.tail;
        }
    }

    return undefined;
};

List.prototype.slice = function (start = 0, end = Infinity) {
    let node = this;
    let index = 0;
    let stack = nil;

    if (end < 0) {
        end = node.length() + end;
    }

    while (List.isList(node) && node != nil && index < end) {
        log('slice(start: %o, end: %o, index: %o)', start, end, index);
        if (index >= start) {
            log('slice(stack: %o)', node.head);
            stack = cons(node.head, stack);
        }

        index++;
        node = node.tail;
    }

    return stack.reverse();
};

List.prototype.split = function (predicate) {
    let after = this;
    let before = l.nil;

    while (List.isList(after) && after != l.nil && !predicate(car(after))) {
        before = cons(car(after), before);
        after = cdr(after);
    }

    return t(before.reverse(), after);
};

List.prototype.deleteIndex = function (deleteIndex) {
    let node = this;
    let stack = nil;

    let index = 0;
    while (List.isList(node) && node != nil) {
        if (index == deleteIndex) {
            node = node.tail;
            break;
        } else {
            stack = cons(node.head, stack);
        }

        node = node.tail;
        index++;
    }

    while (List.isList(stack) && stack != nil) {
        node = cons(stack.head, node);
        stack = stack.tail;
    }

    return node;
};

List.prototype.delete = function (value) {
    let node = this;
    let stack = nil;

    while (List.isList(node) && node != nil) {
        if (value === node.head) {
            node = node.tail;
            break;
        } else {
            stack = cons(node.head, stack);
            node = node.tail;
        }
    }

    while (List.isList(stack) && stack != nil) {
        node = cons(stack.head, node);
        stack = stack.tail;
    }

    return node;
};

List.prototype.append = function (tail) {
    let copy = this.reverse();

    while (List.isList(copy) && copy != nil) {
        tail = cons(car(copy), tail);
        copy = cdr(copy);
    }

    return tail;
};

List.prototype.nth = function (index) {
    let node = this;
    let current = 0;

    while (List.isList(node) && node != nil && current < index) {
        current++;
        node = node.tail;
    }

    if (current === index && node != nil) {
        return node.head;
    } else {
        return undefined;
    }
};

List.prototype[Symbol.iterator] = function* () {
    let node = this;
    while (node instanceof List && node != nil) {
        yield node.head;
        node = node.tail;
    }
};

List.prototype[inspect] = function inspect(
    depth,
    { drewPrefix, ...options },
    inspect
) {
    if (depth < 0) {
        return options.stylize('[List]', 'special');
    }

    if (typeof inspect !== 'function') {
        inspect = require('util').inspect;
    }

    const newOptions = {
        ...options,
        drewPrefix: false,
        depth: options.depth === null ? null : options.depth - 1,
    };

    const prefix = '[';
    const postfix = ' ]';

    let result = '';

    result += prefix;

    let node = this;
    let firstDone = false;
    let count = 0;
    while (
        List.isList(node) &&
        node != nil &&
        count++ < options.maxArrayLength
    ) {
        if (firstDone) {
            result += ',';
        }
        result += ` ${inspect(node.head, newOptions)}`;
        node = node.tail;
        firstDone = true;
    }

    if (List.isList(node) && node != nil) {
        result += ` ... ${node.length()} more items`;
    } else if (node != nil) {
        result += ` | ${inspect(node, newOptions)}`;
    }

    result += postfix;

    return result;
};
List.prototype.toString = function () {
    const prefix = '[';
    const postfix = ' ]';

    let result = '';

    result += prefix;

    let node = this;
    let firstDone = false;
    let count = 0;
    while (List.isList(node) && node != nil) {
        if (firstDone) {
            result += ',';
        }
        result += ` ${safeString(node.head)}`;
        node = node.tail;
        firstDone = true;
    }

    if (node != nil) {
        result += ` | ${String(node)}`;
    }

    result += postfix;

    return result;
};

function safeString(value) {
    if (typeof value === 'symbol') {
        return value.toString();
    } else {
        return String(value);
    }
}

List.prototype[Symbol.toStringTag] = function () {
    return 'List';
};

export function l(...items) {
    return List.from(...items);
}
export function il(...items) {
    if (items.length === 0) {
        return undefined;
    } else {
        let tail = items.pop();
        if (items.length === 0) items.push(undefined);
        for (let i = items.length - 1; i >= 0; i--) {
            const head = items[i];
            tail = List(head, tail);
        }
        return tail;
    }
}
export const cons = List;
export const car = (list) => list.head;
export const cdr = (list) => list.tail;
export const list = l;
export const improperList = il;

Reflect.defineProperty(list, 'nil', {
    configurable: false,
    writable: false,
    value: nil,
});

Reflect.defineProperty(list, 'isList', {
    configurable: false,
    writable: false,
    value: function (value) {
        return value instanceof List || value === nil;
    },
});

Reflect.defineProperty(improperList, 'nil', {
    configurable: false,
    writable: false,
    value: nil,
});

Reflect.defineProperty(improperList, 'isList', {
    configurable: false,
    writable: false,
    value: function (value) {
        return value instanceof List || value === nil;
    },
});
Reflect.defineProperty(List, 'nil', {
    configurable: false,
    writable: false,
    value: nil,
});
Reflect.defineProperty(List, 'isList', {
    configurable: false,
    writable: false,
    value: function (value) {
        return value instanceof List || value === nil;
    },
});
Reflect.defineProperty(List, 'from', {
    configurable: false,
    writable: false,
    value: function (...items) {
        if (items.length === 0) {
            return nil;
        } else {
            let tail = nil;
            for (let i = items.length - 1; i >= 0; i--) {
                const head = items[i];
                tail = List(head, tail);
            }
            return tail;
        }
    },
});
