import { OTPError, Pid } from '@otpjs/types';
import { isAtom } from './helpers.js';
import { badarg, ok } from '../symbols.js';
export class Registrar {
    #log;
    #processManager;
    #registrations;

    constructor(node, processManager) {
        this.#log = node.logger('registrar');
        this.#processManager = processManager;
        this.#registrations = new Map();

        node.addFunction('register', this.register.bind(this));
        node.addFunction('whereis', this.whereis.bind(this));
        node.addFunction('unregister', this.unregister.bind(this));
    }

    unregister(pid, name = undefined) {
        if (name === undefined) {
            const toUnregister = [];
            this.#registrations.forEach((registered, name) => {
                if (Pid.compare(pid, registered) === 0) {
                    toUnregister.push(name);
                }
            });
            toUnregister.forEach((name) => this.unregister(pid, name));
            return ok;
        } else if (this.#registrations.has(name)) {
            this.#registrations.delete(name);
            return ok;
        } else {
            return ok;
        }
    }

    register(pid, name) {
        if (!isAtom(name)) {
            throw OTPError(badarg);
        }

        const ctx = this.#processManager.find(pid);
        if (ctx === undefined) {
            this.#log('register(%o, %o) : ref === undefined', pid, name);
            throw OTPError(badarg);
        } else {
            /* istanbul ignore else */
            if (this.#registrations.has(name)) {
                this.#log(
                    'register(pid: %o, name: %o, error: %o)',
                    pid,
                    name,
                    badarg
                );
                throw new OTPError(badarg);
            } else {
                this.#log('register(pid: %o, name: %o)', pid, name);
                this.#registrations.set(name, pid);

                ctx.death.finally(() => {
                    this.unregister(pid);
                });

                return ok;
            }
        }
    }

    whereis(name) {
        if (this.#registrations.has(name)) {
            return this.#registrations.get(name);
        } else {
            return undefined;
        }
    }
}
