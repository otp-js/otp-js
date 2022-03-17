import inspect from 'inspect-custom-symbol';
export function Pid(node, id, serial, creation = 1) {
    if (!(this instanceof Pid)) return new Pid(node, id, serial, creation);

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
    Reflect.defineProperty(this, 'process', {
        get() {
            return (BigInt(id) << 32n) + BigInt(serial);
        },
        configurable: true,
        enumerable: false,
    });
}

Pid.LOCAL = 0;

Pid.prototype[inspect] = function (depth, options, inspect) {
    if (depth < 0) {
        return options.stylize('[Pid]', 'node');
    }

    return options.stylize(
        `Pid<${this.node}.${this.id}.${this.serial}>`,
        'special'
    );
};
Pid.prototype.toString = function () {
    return `Pid<${this.node}.${this.id}.${this.serial}>`;
};

Pid.isPid = (value) => value instanceof Pid;
Pid.of = (node, id, serial, creation) => new Pid(node, id, serial, creation);
Pid.compare = (a, b) => {
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

if (typeof window !== 'undefined') {
    if (window.devtoolsFormatters === undefined) {
        window.devtoolsFormatters = [];
    }
    window.devtoolsFormatters.push({
        header: (obj) => {
            if (Pid.isPid(obj)) {
                return ['div', { style: 'color: teal;' }, obj.toString()];
            }
        },
        hasBody: () => false,
    });
}
