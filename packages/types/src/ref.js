import inspect from 'inspect-custom-symbol';
import { OTPError } from '../lib/error';
import { t } from './tuple';

const invalid_ref_spec = Symbol.for('invalid_ref_spec');

export function Ref(node, id, serial, creation = 1) {
    if (!(this instanceof Ref)) return new Ref(node, id, serial, creation);

    Reflect.defineProperty(this, 'node', {
        get() {
            return node;
        },
        configurable: false,
        enumerable: true,
    });
    Reflect.defineProperty(this, 'id', {
        get() {
            return id;
        },
        configurable: false,
        enumerable: true,
    });
    Reflect.defineProperty(this, 'serial', {
        get() {
            return serial;
        },
        configurable: false,
        enumerable: true,
    });
    Reflect.defineProperty(this, 'creation', {
        get() {
            return creation;
        },
        configurable: false,
        enumerable: true,
    });
    Reflect.defineProperty(this, 'reference', {
        get() {
            return (BigInt(id) << 32n) + BigInt(serial);
        },
        configurable: true,
        enumerable: false,
    });
}

Ref.LOCAL = 0;
Ref.REMOTE = 'r';
Ref.isRef = (other) => other instanceof Ref;
Ref.for = (node, id, serial, creation) => Ref(node, id, serial, creation);
Ref.from = (string) => {
    const match = string.match(
        /^Ref<(?<node>[0-9]+)\.(?<id>[0-9]+)\.(?<serial>[0-9]+)>$/
    );

    if (match) {
        const { node, id, serial } = match.groups;
        const creation = 1;

        return Ref(parseInt(node), parseInt(id), parseInt(serial), creation);
    } else {
        throw OTPError(t(invalid_ref_spec, string));
    }
};
Ref.compare = (a, b) => {
    if (a.node < b.node) return -1;
    else if (a.node > b.node) return 1;
    else if (a.id < b.id) return -1;
    else if (a.id > b.id) return 1;
    else if (a.serial < b.serial) return -1;
    else if (a.serial > b.serial) return 1;
    else if (a.creation < b.creation) return -1;
    else if (a.creation > b.creation) return 1;
    else return 0;
};
Ref.prototype.toString = function () {
    return `Ref<${this.node}.${this.id}.${this.serial}>`;
};
Ref.prototype[Symbol.toPrimitive] = function (hint) {
    if (hint === 'string') {
        return this.toString();
    }
    return null;
};
Ref.prototype[inspect] = function (depth, options, inspect) {
    if (depth < 0) {
        return options.stylize('[Ref]', 'special');
    }

    return options.stylize(this.toString(), 'special');
};
