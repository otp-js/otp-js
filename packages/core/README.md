# OTPJS
# @otpjs/core
[![Build Status](https://travis-ci.com/fauxsoup/otpjs.svg?branch=master)](https://travis-ci.com/otpjs/otpjs)
[![Coverage Status](https://coveralls.io/repos/github/fauxsoup/otpjs/badge.svg?branch=master)](https://coveralls.io/github/otpjs/otpjs?branch=master)

This project makes heavy use of ES6 features and as such requires NodeJS v16

This is an endeavor to replicate the Open Telecom Platform in NodeJS. You should
probably use *either* NodeJS or Erlang, but this implementation tries to bridge
the gap between the two languages by implementing what is essentially the Erlang
Standard Library: OTP.

## Starting OTPJS
For example, this script would print the string "Hello world"

```javascript
import {OTPNode} from '@otpjs/core';
const node = new OTPNode();

const pid = node.spawn(async (ctx) => {
    const message = await ctx.receive();
    console.log("Hello %s", message);
});

node.spawn(async (ctx) => {
    ctx.send(pid, "world");
})
```

## Symbols

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

``` javascript
import {serialize, deserialize, Symbols} from '@otpjs/core';
const [ok, _] = Symbols

const tuple = [ok, 'test', 123, false];
const json = serialize(tuple);

console.log(json); // [{"$otp.symbol": "$otp.symbol.ok"}, "test", 123, false]

const tupleB = deserialize(json);

console.log(tupleB); // [Symbol($otp.symbol.ok), "test", 123, false]
```

## Pattern Matching
### Usage
This module may be broken out for further development, but for now it resides
within `@otpjs/core`. Pattern matching is done by constructing a comparison
function using a provided pattern as a guide. When applied to a value, this
comparison function returns either true or false.

Pattern matching is a *huge* element of Erlang development, and it did not feel
right to have an OTP implementation without at least an homage to the Erlang's 
insane pattern matching power.

#### Underscore

Understanding the underscore symbol is important. Its usage in `otpjs` reflects
the underscore's usage in Erlang. When provided in a pattern, the underscore matches
against *any* value.

``` javascript
import {compare} from '@otpjs/core';


compare(_, undefined) // true;
compare(_, BigInt(1000)) // true;
compare(_, [1, 2, 3]) // true;
```

#### API
##### `compile(pattern)`
``` javascript
import {compile, Symbols} from '@otpjs/core';

const {ok, _} = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// The basis of pattern matching is the pattern compiler. You can use this
// directly, but we'll see other approaches later on 
const compiled = compile(pattern);

// Pattern compiler constructs a function to assess the incoming
// value against the specified pattern.
compiled([ok, 'fixed string', 1, {}]) // true

// Fixed simple values are required to be  equal in value between the 
// pattern and incoming value. If its conditions are satisified, it returns
// true, otherwise false.
compiled([ok, 'different string', 1, {}]) // false

// Complex types like objects, arrays, and functions are handled differently.
// Functions are assumed to be a predicate which must be satisfied.
// Objects and arrays are traversed to find matching values.
compiled([ok, 'fixed string', 1.1, {}]) // false

```

##### `compare(pattern, value)`
``` javascript
import {compare, Symbols} from '@otpjs/core';

const {ok, _} = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// Compare is a simple utility that compiles and compares the provided pattern
// against the provided value.
compare(pattern, [ok, 'fixed string', 1, {}]) // true
```

##### `caseOf(value)`
``` javascript
import {compile, Symbols} from '@otpjs/core';

const {ok, _} = Symbols;

// caseOf flips the compile/pattern theory on its head. It focuses on the incoming
// value, and provides a comparison function which accepts and compiles incoming
// patterns to validate against the provided value.
const compare = caseOf([1, '2', 3.3]);
compare([Number.isInteger, '2', Number.isFinite]); // true
compare([1, '2', Number.isInteger]); // false
```

#### With Receive

`receive` accepts a pattern or list of patterns as its first argument. These patterns
are compiled if they are not already.

`receive` accepts multiple predicates to compare against incoming values for the
individual call. However, to determine which predicate was satisified, one would
need to re-run each predicate until one is matched.

`receiveWithPredicate` attempts to work around this issue using the following
pattern:

``` javascript
import {OTPNode, Symbols, compile, Pid} from '@otpjs/core';
const node = new OTPNode();

const predicates = {
    justOK: compile(ok),
    okWithPid: compile([ok, Pid.isPid]),
    okWithRef: compile([ok, Ref.isRef]),
    okWithOther: compile([ok, _]),
}
const pid = node.spawn(ctx => {
    const [message, predicate] = ctx.receiveWithPredicate(
        [
            predicates.justOK,
            predicates.okWithPd,
            predicates.okWithRef,
            predicates.okWithOther
        ]
    );
    
    if (predicate === predicates.okWithPid) {
        const [ok, pid] = message;
        // ...
    } else if (predicate === predicates.okWithRef) {
        const [ok, ref] = message;
        // ...
    } // ...
})
```

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

``` sh
npm i @otpjs/proc_lib
```

### gen_server
A limited `gen_server` implementation is defined.

#### Install
``` sh
npm i @otpjs/gen_server
```

#### Usage

``` javascript
import {OTPNode, caseOf, Symbols} from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const {ok} = Symbols;
const {reply} = gen_server.Symbols;

const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo,
    terminate
};

export function start(ctx) {
    return gen_server.start(ctx, callbacks)
}

export function startLink(ctx) {
    return gen_server.startLink(ctx, callbacks)
}

export function myRemoteFunction(ctx, pid, ...args) {
    return gen_server.call(ctx, pid, 'my_remote_function', ...args);
}

function init(ctx) {
    return [ok, Math.random()]
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

### Roadmap
Finish `proc_lib` and `gen_server`. Develop `supervisor`, `gen_fsm`,
`gen_event`, etc.
[![Build Status](https://travis-ci.com/fauxsoup/otpjs.svg?branch=master)](https://travis-ci.com/otpjs/otpjs)
[![Coverage Status](https://coveralls.io/repos/github/fauxsoup/otpjs/badge.svg?branch=master)](https://coveralls.io/github/otpjs/otpjs?branch=master)

This project makes heavy use of ES6 features and as such requires NodeJS v16

This is an endeavor to replicate the Open Telecom Platform in NodeJS. You should
probably use *either* NodeJS or Erlang, but this implementation tries to bridge
the gap between the two languages by implementing what is essentially the Erlang
Standard Library: OTP.

## Starting OTPJS
For example, this script would print the string "Hello world"

```javascript
import {Node} from '@otpjs/core';
const node = new Node();

const pid = node.spawn(async (ctx) => {
    const message = await ctx.receive();
    console.log("Hello %s", message);
});

node.spawn(async (ctx) => {
    ctx.send(pid, "world");
})
```

## Symbols

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

``` javascript
import {serialize, deserialize, Symbols} from '@otpjs/core';
const { ok, _ } = Symbols

const tuple = [ok, 'test', 123, false];
const json = serialize(tuple);

console.log(json); // [["$otp.symbol", "otp:core:ok"}, "test", 123, false]

const tupleB = deserialize(json);

console.log(tupleB); // [Symbol(otp:core:ok), "test", 123, false]
```

## Pattern Matching
### Usage
This module may be broken out for further development, but for now it resides
within `@otpjs/core`. Pattern matching is done by constructing a comparison
function using a provided pattern as a guide. When applied to a value, this
comparison function returns either true or false.

Pattern matching is a *huge* element of Erlang development, and it did not feel
right to have an OTP implementation without at least an homage to the Erlang's 
insane pattern matching power.

#### Underscore

Understanding the underscore symbol is important. Its usage in `otpjs` reflects
the underscore's usage in Erlang. When provided in a pattern, the underscore matches
against *any* value.

``` javascript
import {compare} from '@otpjs/core';


compare(_, undefined) // true;
compare(_, BigInt(1000)) // true;
compare(_, [1, 2, 3]) // true;
```

#### API
##### `compile(pattern)`
``` javascript
import {compile, Symbols} from '@otpjs/core';

const { ok, _ } = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// The basis of pattern matching is the pattern compiler. You can use this
// directly, but we'll see other approaches later on 
const compiled = compile(pattern);

// Pattern compiler constructs a function to assess the incoming
// value against the specified pattern.
compiled([ok, 'fixed string', 1, {}]) // true

// Fixed simple values are required to be  equal in value between the 
// pattern and incoming value. If its conditions are satisified, it returns
// true, otherwise false.
compiled([ok, 'different string', 1, {}]) // false

// Complex types like objects, arrays, and functions are handled differently.
// Functions are assumed to be a predicate which must be satisfied.
// Objects and arrays are traversed to find matching values.
compiled([ok, 'fixed string', 1.1, {}]) // false

```

##### `compare(pattern, value)`
``` javascript
import {compare, Symbols} from '@otpjs/core';

const { ok, _ } = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// Compare is a simple utility that compiles and compares the provided pattern
// against the provided value.
compare(pattern, [ok, 'fixed string', 1, {}]) // true
```

##### `caseOf(value)`
``` javascript
import {compile, Symbols} from '@otpjs/core';

const { ok, _ } = Symbols;

// caseOf flips the compile/pattern approach on its head. It focuses on the incoming
// value, and provides a comparison function which accepts and compiles incoming
// patterns to validate against the provided value.
const compare = caseOf([1, '2', 3.3]);
compare([Number.isInteger, '2', Number.isFinite]); // true
compare([1, '2', Number.isInteger]); // false
```

#### With Receive

`receive` accepts a pattern or list of patterns and a timeout paramter. These patterns
are compiled if they are not already.

``` javascript
import {Node, Symbols} from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';
const node = new Node();

const { ok, _ } = Symbols;
const { call, cast } = gen_server.Symbols;

node.spawn(async function(ctx) {
    // Will either resolve with a message passing one of the two patterns
    // or reject with a timeout error.
    const message = await ctx.receive(
        [call, _, _],
        [cast, _],
        100
    );
});
```

`receive` accepts multiple predicates to compare against incoming values for the
individual call. However, to determine which predicate was satisified, one would
need to re-run each predicate until one is matched.

`receiveWithPredicate` attempts to work around this issue using the following
pattern:

``` javascript
import {Node, Symbols, compile, Pid} from '@otpjs/core';
const node = new Node();

const predicates = {
    justOK: compile(ok),
    okWithPid: compile([ok, Pid.isPid]),
    okWithRef: compile([ok, Ref.isRef]),
    okWithOther: compile([ok, _]),
}
const pid = node.spawn(ctx => {
    const [message, predicate] = ctx.receiveWithPredicate(
            predicates.justOK,
            predicates.okWithPd,
            predicates.okWithRef,
            predicates.okWithOther
    );
    
    if (predicate === predicates.okWithPid) {
        const [ok, pid] = message;
        // ...
    } else if (predicate === predicates.okWithRef) {
        const [ok, ref] = message;
        // ...
    } // ...
})
```

However, this approach requires precompiling your patterns, and doesn't buy much
with respect to resources. There's no significant difference between the above
approach and the below:

``` javascript
import {Node, Symbols, caseOf, Pid} from '@otpjs/core'
```

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
A `proc_lib` implementation is defined.

``` sh
npm i @otpjs/proc_lib
```

### gen_server
A `gen_server` implementation is defined.

#### Install
``` sh
npm i @otpjs/gen_server
```

#### Usage

``` javascript
import {Node, caseOf, Symbols} from '@otpjs/core';
import * as gen_server from '@otpjs/gen_server';

const {ok} = Symbols;
const {reply} = gen_server.Symbols;

const callbacks = {
    init,
    handleCall,
    handleCast,
    handleInfo,
    terminate
};

export function start(ctx) {
    return gen_server.start(ctx, callbacks)
}

export function startLink(ctx) {
    return gen_server.startLink(ctx, callbacks)
}

export function myRemoteFunction(ctx, pid, ...args) {
    return gen_server.call(ctx, pid, 'my_remote_function', ...args);
}

function init(ctx) {
    return [ok, Math.random()]
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

### supervisor

A limited `supervisor` implementation is defined.

Currently supported strategies include:

* `one_for_one`
* `simple_one_for_one`

#### Install

``` sh
npm i @otpjs/supervisor
```

#### Usage

``` javascript
import * as supervisor from '@otpjs/supervisor';
import * as argumentServer from './arguments';
import * as numberServer from './numbers';

const callbacks = {init};

export function startLink(ctx, arg) {
    return supervisor.startLink(ctx, callbacks, [arg, 123])
}

function init(ctx, arg, number) {
    return [
        ok,
        [
            {strategy: one_for_one},
            [
                {
                    id: 'arg-processor',
                    start: [argumentServer.startLink, [arg]]
                },
                {
                    id: 'number-processor',
                    start: [numberServer.startLink, [number]]
                }
            ]
        ]
    ]
}
```

### Roadmap

Long term goals include but are not limited to:

* Full replication of the OTP core process patterns
  * Finish 
    * `proc_lib` 
    * `gen_server`
    * `supervisor`
  * Develop
    * `gen_fsm`
    * `gen_event`
    * `gen_rpc`
* Functional net kernel
* zmq transport
  * network discovery
  * inproc communication for multi-threaded communication via node's cluster module and/or related modules
* erlang distribution protocol transport
* pure wss transport (socket.io transport exists as a reference implementation)
* babel plugin for extended syntax support
  * ! operator
  * case statements
  * function clauses
