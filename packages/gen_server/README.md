# gen_server

A `gen_server` implementation is defined.

## Install

```sh
npm i @otpjs/gen_server
```

## Behavior

### `init(ctx, ...args)`

Initialize the process state and execute any necessary startup operations.

Return can match the following signatures:

-   `t(stop, Reason)`
    -   Immediately stops the process for `Reason`.
    -   Does not invoke `terminate`
-   `t(ok, State)`
    -   Runs the process with `State` as the current state

### `handleCall(ctx, call, from, state)`

Handles a message which has requested a response.

`call` is the term representing the requested operation.
`from` is a `tuple` representing the caller and the unique request.
`state` is the current state of the process.

Return can match one of the following signatures:

-   `t(stop, Reason, Reply, State)`
    -   uses `State` as the next state of the process
    -   sends `Reply` to the caller
    -   stops the server after invoking `terminate` with `Reason`
-   `t(stop, Reason, State)`
    -   uses `State` as the next state of the process
    -   stops the server after invoking `terminate` with `Reason`
-   `t(reply, Response, State)`
    -   uses `State` as the next state of the process
    -   responds to the caller with `Response`
-   `t(reply, Response, State, Timeout)`
    -   uses `State` as the next state of the process
    -   responds to the caller with `Response`
    -   sends the message `timeout` to itself after `Timeout` milliseconds
-   `t(noreply, State)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
-   `t(noreply, State, Timeout)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
    -   sends the message `timeout` to itself after `Timeout` milliseconds

Replies do not have to be immediate. You can store the `from` argument in your state and
respond at a later time by invoking `gen_server.reply(ctx, from, response)`.

### `handleCast(ctx, cast, state)`

Handles a structured message for which there has been no response requested.

`cast` is the term that we are processing.
`state` is the current state of the process.

Return can match one of the following signatures:

-   `t(stop, Reason, State)`
    -   uses `State` as the next state of the process
    -   stops the server after invoking `terminate` with `Reason`
-   `t(noreply, State)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
-   `t(noreply, State, Timeout)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
    -   sends the message `timeout` to itself after `Timeout` milliseconds

### `handleInfo(ctx, info, state)`

Handles an unwrapped message, such as a `DOWN` message or an `EXIT` signal.

`info` is the term that we are processing.
`state` is the current state of the process.

Return can match one of the following signatures:

-   `t(stop, Reason, State)`
    -   uses `State` as the next state of the process
    -   stops the server after invoking `terminate` with `Reason`
-   `t(noreply, State)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
-   `t(noreply, State, Timeout)`
    -   uses `State` as the next state of the process
    -   does not respond to the caller
    -   sends the message `timeout` to itself after `Timeout` milliseconds

### `terminate(ctx, reason, state)`

Invoked when shut down explicitly with a `stop` response, OR when an `EXIT`
signal is received and the process flag `trap_exit` is set.

Ignores the return value.

## Usage

```javascript
import { Node, Symbols } from '@otpjs/core';
import * as matching from '@otpjs/matching';
import { t, l } from '@otpjs/types';
import * as gen_server from '@otpjs/gen_server';

// Let's import some commmonly used symbols
const { ok } = Symbols;
const { reply, noreply } = gen_server.Symbols;

// We need to define a couple of functions to tell gen_server how to act.
// gen_server is just a pattern; without these callbacks it does nothing.
const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);

    server.onCall(t('my_remote_function', l.isList), _myRemoteFunction);
    server.onCall('get_current', _getCurrent);
    server.onCall(_, _doNothing);

    server.onCast('generate', _generate);
    server.onCast(t('finalize', Ref.isRef, _), _finalize);
    server.onCast(_, _doNothingCast);

    server.onInfo(_, _handleInfo);

    server.onTerminate(_terminate);
});

// Start a new gen_server process using our callbacks for the implementation
// Starting a gen_server is asynchronous
export async function start(ctx) {
    return gen_server.start(ctx, callbacks);
}

// Start a new gen_server like above, but also link it to the current context
export async function startLink(ctx) {
    return gen_server.startLink(ctx, callbacks);
}

// Calls implement the request/response pattern over an asynchronous communication
// channel. Calls are asynchronous, and you may never get a response! Implement a
// timeout to prevent your callers from waiting forever if something goes wrong.
// Default timeout is 5 seconds.
export async function myRemoteFunction(ctx, pid, ...args) {
    return gen_server.call(ctx, pid, t('my_remote_function', l(...args)));
}
export async function getCurrent(ctx, pid) {
    return gen_server.call(ctx, pid, 'get_current');
}

// Casts are asynchronous messages. They have a formal pattern unlike pure messages.
export function finalizeRemoteFunction(ctx, pid, ref, result) {
    return gen_server.cast(ctx, pid, t('finalize', ref, result));
}
export function generate(ctx, pid) {
    return gen_server.cast(ctx, pid, 'generate');
}

function _init(ctx) {
    // init is handled during the process startup. If something goes wrong here,
    // the process that starts us will be notified.
    // From here we can make determinations about our setup and configuration,
    // and prepare our initial state.
    return t(ok, Math.random());
}

function _getCurrent(ctx, _call, _from, state) {
    // Reply directly to the caller in this case
    return t(reply, t(ok, state), state);
}
function _myRemoteFunction(ctx, call, _from, state) {
    const [, ...args] = call;
    // Do something somewhere else. We can defer our response until later.
    doRemoteFunction(ctx, from, ...args);
    return t(noreply, state);
}

function _generate(ctx, _cast, _state) {
    const nextState = Math.random();
    // We can always update our state, whether or not a reply is needed.
    return t(noreply, nextState);
}
function _finalize(ctx, _cast, state) {
    const [, from, result] = cast;
    // Now that we've got a final result, we can reply to our deferred request
    gen_server.reply(ctx, from, result);
    return t(noreply, state);
}

function _doNothing(ctx, _call, _from, state) {
    // Not recognized. No need to handle it.
    return t(noreply, state);
}
function _doNothingCast(ctx, _cast, state) {
    // Not recognized. No need to handle it.
    return t(noreply, state);
}

function _handleInfo(ctx, info, state) {
    // handleInfo is used to handle pure messages that come in without either
    // cast or call semantics. This can be useful if you're monitoring other
    // processes, for instance.
    // For the sake of demonstration, let's assume this server's contract
    // does not allow for info messages. Given that, let's stop the process
    // if we receive one.
    return t(stop, t('badinfo', info));
}

function _terminate(ctx, reason, state) {
    // Pre-death cleanup
    return ok;
}
```
