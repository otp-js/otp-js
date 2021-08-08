# gen_server
A `gen_server` implementation is defined.

## Install
``` sh
npm i @otpjs/gen_server
```

## Usage

``` javascript
import {Node, caseOf, Symbols} from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

// Let's import some commmonly used symbols
const {ok} = Symbols;
const {reply, noreply} = gen_server.Symbols;

// We need to define a couple of functions to tell gen_server how to act.
// gen_server is just a pattern; without these callbacks it does nothing.
const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo,
    terminate
};

// Start a new gen_server process using our callbacks for the implementation
// Starting a gen_server is asynchronous
export async function start(ctx) {
    return gen_server.start(ctx, callbacks)
}

// Start a new gen_server like above, but also link it to the current context
export async function startLink(ctx) {
    return gen_server.startLink(ctx, callbacks)
}

// Calls implement the request/response pattern over an asynchronous communication
// channel. Calls are asynchronous, and you may never get a response! Implement a
// timeout to prevent your callers from waiting forever if something goes wrong.
// Default timeout is 5 seconds.
export async function myRemoteFunction(ctx, pid, ...args) {
    return gen_server.call(ctx, pid, ['my_remote_function', ...args]);
}
export async function getCurrent(ctx, pid) {
    return gen_server.call(ctx, pid, 'get_current');
}

// Casts are asynchronous messages. They have a formal pattern unlike pure messages.
export function finalizeRemoteFunction(ctx, pid, ref, result) {
    return gen_server.cast(ctx, pid, ['finalize', ref, result])
}
export function generate(ctx, pid) {
    return gen_server.cast(ctx, pid, 'generate');
}

function init(ctx) {
    // init is handled during the process startup. If something goes wrong here,
    // the process that starts us will be notified.
    // From here we can make determinations about our setup and configuration,
    // and prepare our initial state.
    return [ok, Math.random()]
}

function handleCall(ctx, call, from, state) {
    const compare = caseOf(call);
    
    if (compare(['my_remote_function', spread])) {
        const [, ...args] = call;
        // Do something somewhere else. We can defer our response until later.
        doRemoteFunction(ctx, from, ...args);
        return [noreply, state];
    } else if (compare('get_current')) {
        // Reply directly to the caller in this case
        return [reply, [ok, state], state];
    } else {
        // We don't recognize the request. Ignore it.
        return [noreply, state];
    }
}

function handleCast(ctx, cast, state) {
    const compare = caseOf(cast);
    
    if (compare('generate')) {
        const nextState = Math.random();
        // We can always update our state, whether or not a reply is needed.
        return [noreply, nextState];
    } else if (compare(['finalize', _, _])) {
        const [, from, result] = cast;
        // Now that we've got a final result, we can reply to our deferred request
        gen_server.reply(ctx, from, result);
        return [noreply, state];
    } else {
        // Not recognized. No need to handle it.
        return [noreply, state];
    }
} 

function handleInfo(ctx, info, state) {
    // handleInfo is used to handle pure messages that come in without either
    // cast or call semantics. This can be useful if you're monitoring other
    // processes, for instance.
    // For the sake of demonstration, let's assume this server's contract
    // does not allow for info messages. Given that, let's stop the process
    // if we receive one.
    return [stop, ['badinfo', info]];
}

function terminate(ctx, reason, state) {
    // Pre-death cleanup
    return ok;
}
```
