import { tuple } from '@otpjs/types';

export function OTPError(term, capture) {
    if (!capture) {
        capture = Object.create(OTPError.prototype);
        Error.captureStackTrace(capture, OTPError);
    }

    Object.defineProperty(capture, 'term', {
        get() {
            return term;
        },
        configurable: false,
        enumerable: true,
    });
    Object.defineProperty(capture, 'message', {
        get() {
            return String(term);
        },
        configurable: false,
        enumerable: true,
    });
    return capture;
}

OTPError.prototype = Object.create(Error.prototype);
OTPError.prototype.constructor = OTPError;
OTPError.prototype[Symbol.for('nodejs.util.inspect.custom')] = function (
    depth,
    options,
    inspect
) {
    const newOptions = {
        ...options,
        depth: options.depth === null ? null : options.depth - 1,
    };
    const stacktrace = this.stack.slice(this.stack.indexOf('\n') + 1);
    return `Error: ${inspect(this.term, newOptions)}\n${stacktrace}`;
};
