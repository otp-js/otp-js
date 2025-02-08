import { error } from '@otpjs/core/symbols';
import { OTPError, Pid, t } from '@otpjs/types';

const invalid_source = Symbol.for('invalid_source');
const invalid_name = Symbol.for('invalid_name');
const invalid_id = Symbol.for('invalid_id');

function notType(value, type) {
    return !value || typeof value !== type;
}

function notSymbol(value) {
    return notType(value, 'symbol');
}

function notNumber(value) {
    return notType(value, 'number');
}

function validateAttributes(attr) {
    if (notSymbol(attr.source))
        throw OTPError(t(error, t(invalid_source, attr.source)));
    if (notNumber(attr.id)) throw OTPError(t(error, t(invalid_id, attr.id)));
    if (notSymbol(attr.name))
        throw OTPError(t(error, t(invalid_name, attr.name)));
}

export class RemoteNode {
    #attributes;
    #signal;
    #features;

    constructor({ signal, bridge, ...attributes }) {
        validateAttributes(attributes);

        this.#attributes = attributes;
        this.#features = new Set();
        this.#signal = signal;

        if (bridge) {
            this.#features.add('bridge');
        }
    }

    static compare(a, b) {
        if (a.pid === null && b.pid !== null) {
            return 1;
        } else if (a.pid === null && b.pid === null) {
            return 0;
        } else if (a.pid !== null && b.pid === null) {
            return -1;
        } else if (Pid.compare(b.pid, a.pid) !== 0) {
            if (b.score < a.score) {
                return 1;
            } else {
                return -1;
            }
        } else {
            return 0;
        }
    }

    get id() {
        return this.#attributes.id;
    }

    get source() {
        return this.#attributes.source;
    }

    get score() {
        return this.#attributes.score;
    }

    get name() {
        return this.#attributes.name;
    }

    get pid() {
        return this.#attributes.pid;
    }

    get type() {
        return this.#attributes.type;
    }

    get bridge() {
        return this.can('bridge');
    }

    get features() {
        return this.#features;
    }

    can(op) {
        return this.#features.has(op);
    }

    lost() {
        this.#signal = null;
        this.#attributes.pid = null;
    }

    found(signal) {
        this.#signal = signal;
    }

    signal(...message) {
        if (this.#signal) {
            this.#signal(message);
        } else {
            throw OTPError(t(error, `signaling invalid remote: ${this.name}`));
        }
    }
}
