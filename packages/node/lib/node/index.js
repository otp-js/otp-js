import debug from 'debug';
import { Pid, Ref, OTPError, t, l, cons } from '@otpjs/types';
import * as Symbols from '../symbols.js';
import * as matching from '@otpjs/matching';
import { Context } from '#context';
import { Network } from './network.js';
import { Registrar } from './registrar.js';
import { ProcessManager } from './process-manager.js';
import { isAtom } from './helpers.js';
import * as functions from '#node/functions';

const {
    EXIT,
    badarg,
    error,
    ok,
    relay,
} = Symbols;
const { _, spread } = matching.Symbols;

const log = debug('otpjs:core:node');

const isLocalPid = (v) => Pid.isPid(v) && v.node === Pid.LOCAL;

function getNodeId() {
    return `otp-${Node.nodes++}`;
}

function getNodeHost() {
    if (typeof window === 'undefined') {
        return '127.0.0.1';
    } else {
        return window.location.hostname;
    }
}

export class Node {
    static nodes = 0;
    static get Context() {
        return Context;
    }

    #functions;
    #id;
    #log;
    #network;
    #processes;
    #registrar;
    #systemContext;
    system;

    constructor(options = {}) {
        const { id = Symbol.for(`${getNodeId()}@${getNodeHost()}`) } = options;
        this.#id = id;
        this.#log = debug(`otpjs:core:node<${Symbol.keyFor(this.name)}>`);

        this.#functions = new Map();
        this.#processes = new ProcessManager(this, Context);
        this.#systemContext = this.makeContext();
        this.system = this.#systemContext.self();

        this.#network = new Network(this);
        this.#registrar = new Registrar(this, this.#processes);

        functions.install(this);
    }

    addFunction(name, fun) {
        if (this.#functions.has(name)) {
            throw new OTPError(badarg);
        }
        this[name] = fun;
        this.#functions.set(name, fun);
    }

    exec(name, args = []) {
        if (this.#functions.has(name)) {
            const fun = this.#functions.get(name);
            this.#log('exec(name: %o, fun: %o)', name, fun);
            return fun(...args);
        } else {
            throw new OTPError(badarg);
        }
    }

    get name() {
        return this.#id;
    }

    get systemPid() {
        return this.system;
    }

    #signal = matching.clauses((route) => {
        route(_, _, isAtom, spread).to(this.#signalLocalName.bind(this));
        route(_, _, isLocalPid, spread).to(this.#signalLocal.bind(this));
        route(_, _, Pid.isPid, spread).to(this.#signalRemote.bind(this));
        route(_, _, t(_, _), spread).to(this.#signalRemoteName.bind(this));
    }, 'node.signal');
    signal(...args) {
        try {
            this.#log('signal(%o)', args);
            return this.#signal(...args);
        } catch (err) {
            return t(error, err);
        }
    }
    #signalLocal(fromPid, signal, toPid, ...args) {
        const toCtx = this.#processes.find(toPid);
        this.#log(
            '#signalLocal(fromPid: %o, signal: %o, toPid: %o)',
            fromPid,
            signal,
            toPid
        );
        if (toCtx && !toCtx.dead) {
            return toCtx.signal(signal, fromPid, ...args);
        } else {
            return t(error, 'noproc');
        }
    }
    #signalLocalName(fromPid, signal, toProc, ...args) {
        const toPid = this.#registrar.whereis(toProc);
        this.#log('#signalLocalName(toProc: %o, toPid: %o)', toProc, toPid);
        if (toPid) {
            this.#signalLocal(fromPid, signal, toPid, ...args);
        } else {
            this.signal(this.systemPid, EXIT, fromPid, badarg);
        }
    }
    #signalRemote(fromPid, signal, toPid, ...args) {
        const nodeId = toPid.node;
        const router = this.#network.findById(nodeId);

        if (router && router.pid) {
            this.#log('#signalRemote(router.pid: %o)', router.pid);
            this.signal(
                fromPid,
                relay,
                router.pid,
                t(relay, t(signal, fromPid, toPid, ...args))
            );
            return ok;
        } else {
            this.#log('#signalRemote(noconnection)');
            return t(error, 'noconnection');
        }
    }
    #signalRemoteName(fromPid, signal, nameNodePair, ...args) {
        const [toProc, toNode] = nameNodePair;

        this.#log('#signalRemoteName(toProc: %o, toNode: %o)', toProc, toNode);

        if (toNode === this.name) {
            return this.#signalLocalName(fromPid, signal, toProc, ...args);
        } else {
            const router = this.#network.findByName(toNode);

            this.#log('#signalRemoteName(router: %o)', router);

            if (router) {
                this.signal(
                    fromPid,
                    relay,
                    router.pid,
                    t(relay, t(signal, fromPid, toProc, ...args))
                );
                return ok;
            } else {
                return t(error, 'noconnection');
            }
        }
    }

    makeContext() {
        return this.#processes.create();
    }

    deliver(fromPid, toProc, message) {
        this.#log(
            'deliver(fromPid: %o, toProc: %o, message: %o)',
            fromPid,
            toProc,
            message
        );
        this.signal(fromPid, relay, toProc, message);
        return ok;
    }

    processInfo(pid) { }

    logger(...segments) {
        return this.#log.extend(...segments);
    }
}
