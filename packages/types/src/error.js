import { tuple } from '@otpjs/types';

export class OTPError extends Error {
    #original;

    constructor(message) {
        let json = null;
        if (typeof message !== 'string' && typeof message !== 'number') {
            json = JSON.stringify(message);
        }

        super(json ?? null);

        this.#original = message;
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
