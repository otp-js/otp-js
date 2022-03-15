# Open Telecom Platform on JS

[![Build Status](https://travis-ci.com/otp-js/otp-js.svg?branch=main)](https://travis-ci.com/otp-js/otp-js)
[![Coverage Status](https://coveralls.io/repos/github/otp-js/otp-js/badge.svg?branch=main)](https://coveralls.io/github/otp-js/otp-js?branch=main)

This project makes heavy use of ES6 features and as such requires NodeJS v16

This is an endeavor to replicate the Open Telecom Platform in NodeJS. You should
probably use _either_ NodeJS or Erlang, but this implementation tries to bridge
the gap between the two languages by implementing what is essentially the Erlang
Standard Library: OTP.

## Starting OTPJS

For example, this script would print the string "Hello world"

```javascript
import { Node } from '@otpjs/core';
const node = new Node();

const pid = node.spawn(async (ctx) => {
    const message = await ctx.receive();
    console.log('Hello %s', message);
});

node.spawn(async (ctx) => {
    ctx.send(pid, 'world');
});
```

## Conventions

### Symbols

Symbols are used in places to replicate the behavior of atoms in Erlang. `@otpjs/core`
provides its own serialize/deserialize functions for passing data over a text channel.
These serialize/deserialize functions properly handle both `Symbol` types (as long as
they are built with `Symbol.for(...)`), and the built-in `String` extensions `Pid`
and `Ref`.

The end result of serialization is a valid JSON string. Deserialization will restore
available `Symbol`, `Pid`, and `Ref` elements.

As with `JSON.stringify` and `JSON.parse`, these serialize/deserialize functions accept
a `replacer` and `reviver` parameter respectively so that you can handle your own data
serialization as well.

```javascript
import { serialize, deserialize, Symbols } from '@otpjs/core';
const [ok, _] = Symbols;

const tuple = [ok, 'test', 123, false];
const json = serialize(tuple);

console.log(json); // [{"$otp.symbol": "$otp.symbol.ok"}, "test", 123, false]

const tupleB = deserialize(json);

console.log(tupleB); // [Symbol($otp.symbol.ok), "test", 123, false]
```

Symbols are written using `snake_case` in `otp-js`.

### Variables

In order to distinguish variable names from atom or symbol names, we advise writing them with `camelCase`.

### Functions

All public functions should be exported with names written in `camelCase`.

Internal functions should be prefixed by an underscore (e.g., `_privateMethod()`).

### Pattern Matching

We provide pattern matching functionality in [`@otpjs/matching`](/packages/matching).

## Processes

### Lifecycle

As in Erlang, every process has a unique identifier associated with it, as well
as message queues.

Process lifecycles are tracked through Promises. As long as you have an
unresolved Promise in your context it will be considered to be alive. Once your
promise chain ends, your context is considered to be dead! In this way, think of
your context/promise-chain as an Erlang process.

## Library

### proc_lib

A limited `proc_lib` implementation is defined.

```sh
npm i @otpjs/proc_lib
```

### gen_server

A limited `gen_server` implementation is defined.

#### Install

```sh
npm i @otpjs/gen_server
```

#### Usage

```javascript
import { Node, caseOf, Symbols } from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const { ok } = Symbols;
const { reply } = gen_server.Symbols;

const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo,
    terminate,
};

export function start(ctx) {
    return gen_server.start(ctx, callbacks);
}

export function startLink(ctx) {
    return gen_server.startLink(ctx, callbacks);
}

export function myRemoteFunction(ctx, pid, ...args) {
    return gen_server.call(ctx, pid, 'my_remote_function', ...args);
}

function init(ctx) {
    return [ok, Math.random()];
}

function handleCall(ctx, call, from, state) {
    const nextState = Math.random();
    const compare = caseOf(call);
    return [reply, ok, nextState];
}

function handleCast(ctx, cast, state) {
    const nextState = Math.random();
    return [noreply, nextState];
}

function handleInfo(ctx, info, state) {
    const nextState = Math.random();
    return [noreply, nextState];
}

function terminate(ctx, reason, state) {
    // Pre-death cleanup
    return ok;
}
```

### Advanced gen_server Usage

To simplify usage of the `gen_server` module, we have implemented a generative
interface for handling patterns and callbacks. See below:

```javascript
import * as otp from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const { ok, _ } = otp.Symbols;
const { reply, noreply } = gen_server.Symbols;

const get_state = Symbol.for('get_state');

const callbacks = gen_server.callbacks((server) => {
    server.onInit(_init);

    server.onCall([get_state, _], _getState);
    server.onCall(_, _handleCall);

    server.onCast(_, _handleCast);

    server.onInfo(_, _handleInfo);

    server.onTerminate(_terminate);
});

async function _init(ctx, ...args) {
    return [ok, { args }];
}

async function _getState(ctx, [, reset], _from, state) {
    if (reset) {
        return [reply, state, {}];
    } else {
        return [reply, state, state];
    }
}
async function _handleCall(ctx, call, _from, state) {
    // catch-all for calls
    return [reply, ok, state];
}

async function _handleCast(ctx, cast, state) {
    // catch-all for casts
    return [noreply, state];
}

async function _handleInfo(ctx, info, state) {
    // catch-all for info
    return [noreply, state];
}

async function _terminate(ctx, reason, state) {
    // tear-down
    return ok;
}
```

### Roadmap

Long term goals include but are not limited to:

-   Full replication of the OTP core process patterns
    -   Finish
        -   `proc_lib`
        -   `gen_server`
        -   `supervisor`
    -   Develop
        -   `gen_fsm`
        -   `gen_event`
        -   `gen_rpc`
-   Functional net kernel
-   zmq transport
    -   network discovery
    -   inproc communication for multi-threaded communication via node's cluster module and/or related modules
-   erlang distribution protocol transport
-   pure wss transport (socket.io transport exists as a reference implementation)
-   babel plugin for extended syntax support
    -   ! operator
    -   case statements
    -   function clauses
