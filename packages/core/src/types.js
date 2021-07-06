export class Ref extends String {
    static LOCAL = 0;
    static regex = /^Ref<(?<node>[0-9]+)\.(?<ref>[0-9]+)>\.(?<count>[0-9]+)$/;

    static isRef(string) {
        return string instanceof Ref;
    }

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

    static for(node, ref) {
        return new Ref(`Ref<${node}.${ref}>`)
    }
}


export class Pid extends String {
    static LOCAL = 0;
    static regex = /^Pid<(?<node>[0-9]+)\.(?<process>[0-9]+)>$/;

    static isPid(string) {
        return string instanceof Pid;
    }

    get node() {
        return this.match(Pid.regex).groups.node;
    }

    get process() {
        return this.match(Pid.regex).groups.process;
    }

    static of(node, process) {
        return new Pid(`Pid<${node}.${process}>`)
    }
}
