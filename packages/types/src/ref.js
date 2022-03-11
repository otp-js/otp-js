export class Ref extends String {
    static LOCAL = '0';
    static REMOTE = 'r';
    static regex = /^Ref<(?<node>[0-9r]+)\.(?<ref>[0-9]+)>$/;

    static isRef = (string) => string instanceof Ref;
    static for = (node, ref) => new Ref(`Ref<${node}.${ref}>`);
    static compare = (a, b) =>
        (a ?? '').toString().localeCompare((b ?? '').toString());

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