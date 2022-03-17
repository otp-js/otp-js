import inspect from 'inspect-custom-symbol';
export class Pid extends String {
    static LOCAL = '0';
    static REMOTE = 'r';
    static regex = /^Pid<(?<node>[0-9r]+)\.(?<process>[0-9]+)>$/;

    static isPid(string) {
        return string instanceof Pid;
    }
    static of = (node, process) => new Pid(`Pid<${node}.${process}>`);
    static compare = (a, b) =>
        (a ?? '').toString().localeCompare((b ?? '').toString());

    get node() {
        const match = this.match(Pid.regex);
        if (match !== null) {
            return match.groups.node;
        } else {
            throw new OTPError(['invalid_pid', this.toString()]);
        }
    }

    get process() {
        const match = this.match(Pid.regex);
        if (match !== null) {
            return match.groups.process;
        } else {
            throw new OTPError(['invalid_pid', this.toString()]);
        }
    }

    [inspect](depth, options, inspect) {
        if (depth < 0) {
            return options.stylize('[Pid]', 'special');
        }

        return `Pid<${options.stylize(`${this.node}.${this.process}`)}>`;
    }
}
