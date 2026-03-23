import * as Symbols from '../../symbols.js';
import { t, OTPError } from '@otpjs/types';
const { error, normal } = Symbols;
export function install(node) {
    node.addFunction('spawn', function spawn(fun) {
        const ctx = node.makeContext();
        const pid = ctx.self();

        doSpawn(ctx, fun);

        return pid;
    });
    node.addFunction('spawnLink', function spawnLink(linked, fun) {
        const ctx = node.makeContext();
        const pid = ctx.self();

        node.exec('link', [linked, pid]);
        doSpawn(ctx, fun);

        return pid;
    });
    node.addFunction('spawnMonitor', function spawnMonitor(monitoring, fun) {
        const ctx = node.makeContext();
        const pid = ctx.self();

        const mref = node.exec('monitor', [monitoring, pid]);
        doSpawn(ctx, fun);

        return t(pid, mref);
    });

    function doSpawn(ctx, fun) {
        setTimeout(go);
        async function go() {
            try {
                await fun(ctx);
                ctx.die(normal);
            } catch (err) {
                if (err instanceof OTPError) {
                    ctx.die(err.term);
                } else if (err instanceof Error) {
                    ctx.die(t(error, err.message));
                } else {
                    ctx.die(err);
                }
            }
        }
    }
}
