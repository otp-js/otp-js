import { error } from './symbols';
import { serialize, deserialize } from './serializer';

export class OTPError extends Error {
    constructor(message) {
        let json = false;
        if (
            typeof message !== 'string'
            && typeof message !== 'number'
            && typeof message !== 'boolean'
            && typeof message !== 'undefined'
        ) {
            json = true;
            message = serialize(message);
        }

        super(message);

        if (json) {
            this._json = true;
        }
    }

    toJSON() {
        let message = this.message;
        let stack = this.stack;

        if (this._json) {
            message = deserialize(message);
        }

        return [
            error,
            message,
        ];
    }
}
