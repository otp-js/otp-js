import { tuple } from '@otpjs/types';

export class OTPError extends Error {
    #original;
    get term() {
        return this.#original;
    }

    constructor(message) {
        super(JSON.stringify(message));
        this.#original = message;
        Error.captureStackTrace(this, OTPError);
    }

    [Symbol.for('nodejs.util.inspect.custom')](depth, options, inspect) {
        const newOptions = {
            ...options,
            depth: options.depth === null ? null : options.depth - 1,
        };
        const stacktrace = this.stack.slice(this.stack.indexOf('\n') + 1);
        return `Error: ${inspect(this.#original, newOptions)}\n${stacktrace}`;
    }

    toJSON() {
        return this.#original;
    }
}
