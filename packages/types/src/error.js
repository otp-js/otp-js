import debug from 'debug';

const log = debug('otp:types:error');

export function OTPError(term) {
    let constructed;
    log('OTPError(term: %o, new.target: %o)', term, new.target);

    if (new.target === undefined) {
        constructed = Object.create(OTPError.prototype);
    } else {
        constructed = this;
    }

    Error.captureStackTrace(constructed, OTPError);

    Object.defineProperty(constructed, 'term', {
        get() {
            return term;
        },
        configurable: false,
        enumerable: true,
    });
    Object.defineProperty(constructed, 'message', {
        get() {
            return String(term);
        },
        configurable: false,
        enumerable: true,
    });

    return constructed;
}

OTPError.prototype = Object.create(Error.prototype);
OTPError.prototype.constructor = OTPError;
OTPError.prototype[Symbol.for('nodejs.util.inspect.custom')] = function (
    depth,
    options,
    inspect
) {
    if (typeof inspect !== 'function') {
        inspect = require('util').inspect;
    }

    const newOptions = {
        ...options,
        depth: options.depth === null ? null : options.depth - 1,
    };
    const stacktrace = this.stack.slice(this.stack.indexOf('\n') + 1);
    return `Error: ${inspect(this.term, newOptions)}\n${stacktrace}`;
};
