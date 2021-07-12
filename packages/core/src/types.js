import { OTPError } from "./error";

export class Ref extends String {
    static LOCAL = 0;
    static regex = /^Ref<(?<node>[0-9]+)\.(?<ref>[0-9]+)>\.(?<count>[0-9]+)$/;

    static isRef = (string) => string instanceof Ref;
    static for = (node, ref) => new Ref(`Ref<${node}.${ref}>`);

    get node() {
        return this.match(Ref.regex).groups.node;
    }

    get ref() {
        return this.match(Ref.regex).groups.ref;
    }

    [Symbol.toPrimitive](hint) {
        if (hint === 'string') {
            return super.valueOf();
        }
        return null;
    }
}


export class Pid extends String {
    static LOCAL = 0;
    static regex = /^Pid<(?<node>[0-9]+)\.(?<process>[0-9]+)>$/;

    static isPid = (string) => string instanceof Pid;
    static of = (node, process) => new Pid(`Pid<${node}.${process}>`);

    get node() {
        const match = this.match(Pid.regex);
        if (match !== null) {
            return match.groups.node;
        } else {
            throw new OTPError(['invalid_pid', this.toString()])
        }
    }

    get process() {
        const match = this.match(Pid.regex);
        if (match !== null) {
            return match.groups.process;
        } else {
            throw new OTPError(['invalid_pid', this.toString()])
        }
    }
}
