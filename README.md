# OTP-JS
[![Build Status](https://travis-ci.com/fauxsoup/otp-js.svg?branch=master)](https://travis-ci.com/otp-js/otp-js)
[![Coverage Status](https://coveralls.io/repos/github/fauxsoup/otp-js/badge.svg?branch=master)](https://coveralls.io/github/otp-js/otp-js?branch=master)

This project makes heavy use of ES6 features and as such requires NodeJS v16

This is an endeavor to replicate the Open Telecom Platform in NodeJS. You should
probably use *either* NodeJS or Erlang, but this implementation tries to bridge
the gap between the two languages by implementing what is essentially the Erlang
Standard Library: OTP.

## Starting OTPJS
For example, this script would print the string "Hello world"

```javascript
import {OTPNode} from '@otp-js/core';
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

Symbols are used in places to replicate the behavior of atoms in Erlang. `@otp-js/core`
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
import {serialize, deserialize, Symbols} from '@otp-js/core';
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
within `@otp-js/core`. Pattern matching is done by constructing a comparison
function using a provided pattern as a guide. When applied to a value, this
comparison function returns either true or false.

Pattern matching is a *huge* element of Erlang development, and it did not feel
right to have an OTP implementation without at least an homage to the Erlang's 
insane pattern matching power.

#### Underscore

Understanding the underscore symbol is important. Its usage in `otp-js` reflects
the underscore's usage in Erlang. When provided in a pattern, the underscore matches
against *any* value.

``` javascript
import {compare} from '@otp-js/core';


compare(_, undefined) // true;
compare(_, BigInt(1000)) // true;
compare(_, [1, 2, 3]) // true;
```

#### API
##### `compile(pattern)`
``` javascript
import {compile, Symbols} from '@otp-js/core';

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
import {compare, Symbols} from '@otp-js/core';

const {ok, _} = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// Compare is a simple utility that compiles and compares the provided pattern
// against the provided value.
compare(pattern, [ok, 'fixed string', 1, {}]) // true
```

##### `caseOf(value)`
``` javascript
import {compile, Symbols} from '@otp-js/core';

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
import {OTPNode, Symbols, compile, Pid} from '@otp-js/core';
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
npm i @otp-js/proc_lib
```

### gen_server
A limited `gen_server` implementation is defined.

#### Install
``` sh
npm i @otp-js/gen_server
```

#### Usage

``` javascript
import {OTPNode, caseOf, Symbols} from '@otp-js/core';
import * as gen_server from '@otp-js/gen_server';

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
