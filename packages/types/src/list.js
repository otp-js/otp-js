import inspect from 'inspect-custom-symbol';

const hidden = new WeakMap();
const nil = Object(Symbol.for('nil'));

_bind(nil);

export function List(head, tail = nil) {
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
    Reflect.defineProperty(obj, 'unshift', {
        value(value) {
            if (!empty) {
                tail = cons(head, tail);
            }
            head = value;
            empty = false;
        },
    });
    Reflect.defineProperty(obj, 'shift', {
        value() {
            if (empty) {
                return head;
            } else if (tail !== nil && List.isList(tail)) {
                let result = head;
                head = tail.head;
                tail = tail.tail;
                return result;
            } else if (tail === nil) {
                head = undefined;
                empty = true;
                return head;
            }
        },
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

List.prototype.push = function (value) {
    if (this === nil) {
        return cons(value, nil);
    }

    let node = this;
    let previous = nil;
    let stack = nil;

    while (List.isList(node) && node != nil) {
        stack.unshift(node);
        previous = node;
        node = node.tail;
    }

    if (!List.isList(node)) {
        throw Error('pushed to improper list');
    }

    let result = cons(previous.head, cons(value, nil));
    while (List.isList(stack) && stack != nil) {
        result.unshift(stack.shift());
    }

    return result;
};

List.prototype.reverse = function () {
    let reversed = List();
    let node = this;

    while (List.isList(node) && node != nil) {
        reversed = cons(node.head, reversed);
        node = node.tail;
    }

    return reversed;
};

List.prototype.replaceWhere = function (predicate, nextValue, insert) {
    let node = this;
    let stack = nil;

    while (List.isList(node) && node != nil) {
        if (predicate(node.head)) {
            stack = cons(nextValue, node.tail);
            break;
        } else {
            stack = cons(node.head, stack);
        }

        node = node.tail;
    }

    while (List.isList(stack) && stack != nil) {
        node = cons(stack.head, node);
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

    return false;
};

List.prototype.slice = function (start = 0, end = Infinity) {
    let node = this;
    let index = 0;
    let stack = nil;

    if (end < 0) {
        end = node.length() + end;
    }

    while (List.isList(node) && node != nil && index < end) {
        if (index > start) {
            stack = cons(node.head, stack);
        }

        index++;
        node = node.tail;
    }

    return stack.reverse();
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
    }

    return node;
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

    const newOptions = {
        ...options,
        drewPrefix: false,
        depth: options.depth === null ? null : options.depth - 1,
    };

    const prefix = '[ ';
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

    result += postfix;

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
