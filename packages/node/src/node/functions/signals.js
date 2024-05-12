import * as Symbols from '../../symbols';
import * as matching from '@otpjs/matching';
import { t } from '@otpjs/types';
const { _ } = matching.Symbols;

export function install(node) {
    const log = node.logger('signals');
    const monitors = new WeakMap();

    node.addFunction('link', function link(source, target) {
        node.signal(source, Symbols.link, target);
        node.signal(target, Symbols.link, source);
    });

    node.addFunction('unlink', function unlink(source, target) {
        node.signal(source, Symbols.unlink, target);
        node.signal(target, Symbols.unlink, source);
    });

    node.addFunction('deliver', function deliver(source, target, message) {
        node.signal(source, Symbols.relay, target, message);
        return Symbols.ok;
    });

    node.addFunction('monitor', function monitor(source, target, ref) {
        ref = ref ?? node.exec('ref');
        monitors.set(ref, target);
        const response = node.signal(source, Symbols.monitor, target, ref);
        const compare = matching.caseOf(response);

        if (compare(t(Symbols.error, _))) {
            const [, reason] = response;
            log(
                'monitor(target: %o, ref: %o, source: %o, error: %o)',
                target,
                ref,
                source,
                reason
            );
            node.signal(target, Symbols.DOWN, source, ref, reason);
        }

        return ref;
    });

    node.addFunction('demonitor', function demonitor(source, ref) {
        if (monitors.has(ref)) {
            const target = monitors.get(ref);
            monitors.delete(ref);
            return node.signal(source, Symbols.demonitor, target, ref);
        } else {
            return Symbols.ok;
        }
    });

    node.addFunction('exit', function exit(source, target, reason) {
        node.signal(source, Symbols.exit, target, reason);
    });
}
