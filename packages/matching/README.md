# `@otpjs/matching`

## Pattern Matching

### Usage

```javascript
import * as matching from '@otpjs/matching';
```

Pattern matching is accomplished by constructing a comparison function using a provided
pattern as a guide. When applied to a value, this comparison function returns
either true or false.

Pattern matching is a _huge_ element of Erlang development, and it did not feel
right to have an OTP implementation without at least an homage to the Erlang's
insane pattern matching power.

#### Underscore

Understanding the underscore symbol is important. Its usage in `otpjs` reflects
the underscore's usage in Erlang. When provided in a pattern, the underscore matches
against _any_ value.

#### Type Support

Basic Javascript types are supported, and additional support is added for the 
types available in [`@otpjs/types`](../types).

```javascript
import { compare } from '@otpjs/matching;

compare(_, undefined); // true;
compare(_, BigInt(1000)); // true;
compare(_, [1, 2, 3]); // true;
```

#### API

##### `compile(pattern)`

```javascript
import { compile, Symbols } from '@otpjs/matching;

const { ok, _ } = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// The basis of pattern matching is the pattern compiler. You can use this
// directly, but we'll see other approaches later on
const compiled = compile(pattern);

// Pattern compiler constructs a function to assess the incoming
// value against the specified pattern.
compiled([ok, 'fixed string', 1, {}]); // true

// Fixed simple values are required to be  equal in value between the
// pattern and incoming value. If its conditions are satisified, it returns
// true, otherwise false.
compiled([ok, 'different string', 1, {}]); // false

// Complex types like objects, arrays, and functions are handled differently.
// Functions are assumed to be a predicate which must be satisfied.
// Objects and arrays are traversed to find matching values.
compiled([ok, 'fixed string', 1.1, {}]); // false
```

##### `compare(pattern, value)`

```javascript
import { compare, Symbols } from '@otpjs/matching';

const { ok, _ } = Symbols;

const pattern = [ok, 'fixed string', Number.isInteger, _];

// Compare is a simple utility that compiles and compares the provided pattern
// against the provided value.
compare(pattern, [ok, 'fixed string', 1, {}]); // true
```

##### `caseOf(value)`

```javascript
import { compile, Symbols } from '@otpjs/matching';

const { ok, _ } = Symbols;

// caseOf flips the compile/pattern theory on its head. It focuses on the incoming
// value, and provides a comparison function which accepts and compiles incoming
// patterns to validate against the provided value.
const compare = caseOf([1, '2', 3.3]);
compare([Number.isInteger, '2', Number.isFinite]); // true
compare([1, '2', Number.isInteger]); // false
```

##### `buildCase(builder)`

Use `buildCase` to use a predefined set of patterns to make a decision for a given
value. Supply a routing function which assembles patterns and what to do with them.
Once built, call one of the two provided methods whenever you need to make a decision
based on a pattern.

```javascript
import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import {t, l} from '@otpjs/types';

const {ok} = otp.Symbols;
const {_, spread} = matching.Symbols;

const getType = buildCase(matches => {
    // `matches` signature is: matches(pattern, handler)
    //   `pattern`: the uncompiled pattern to test against
    //   `handler`: the code to invoke when the pattern fits

    matches(t.isTuple, (tuple) => `tuple[${size}]`);
    matches(l.isList, (list) => `list[${list.length()}]`);
    matches(Array.isArray, (array) => `array[${array.length}]`);
});

// The `for` method returns the handler supplied to `matches`.
// This allows you to pass forward any extra arguments you
// wish to use. Useful for passing closure values in.
const handler = getType.for(t(1,2,3));
console.log(handler(t(1,2,3,4,5,6))); // "tuple[6]"

// The `with` method invokes the handler supplied to `matches`
// immediately, returning the result.
const type = getType.with(t(1,2,3));
console.log(type) // "tuple[3]"
```

##### `clauses(builder)`

Use `clauses` to construct a routing function. Similar to `buildCase`
but matches against multiple arguments. Skips an initial `Context`
argument for pattern matching purposes, but forwards it to the chosen
function. Useful for emulating Erlang's function clauses/overloading.

```javascript
import * as otp from '@otpjs/core';
import * as matching from '@otpjs/matching';
import * as gen from '@otpjs/gen';
import { Pid, Ref, t, l } from '@otpjs/types';

const { ok } = otp.Symbols;
const { _, spread } = matching.Symbols;
const { $gen_call, $gen_cast } = gen.Symbols;

// For demonstration, let's create a naive gen_server-like loop. We accept
// a `Context` and 3 additional arguments:
//   `callbacks`: the callbacks this process started with
//   `incoming`: the message that we're processing
//   `state`: the custom state of this process

// The `Context` is a given. It is not considered for pattern matching.
// We only need to match the three remaining arguments.

const isFunctionWithArity = (length) => (v) =>
    typeof v === 'function' && v.length === length;
const isFunctionWithAtLeastArity = (length) => (v) =>
    typeof v === 'function' && v.length >= length;

async function init(ctx, callbacks, args) {
    let state = await callbacks.init(ctx, ...args);
    while (!ctx.dead) {
        const message = await ctx.receive();
        const response = await loop(ctx, callbacks, message, state);

        // ...handle the response appropriately
    }
}

const loop = matching.clauses((route) => {
    const _callbacks = {
        init: isFunctionWithAtLeastArity(1),
        handleCall: isFunctionWithArity(4),
        handleCast: isFunctionWithArity(3),
        handleInfo: isFunctionWithArity(3),
        terminate: isFunctionWithArity(2),
    };

    route(_callbacks, t($gen_call, t(Pid.isPid, Ref.isRef), _), _).to(
        handleCall
    );
    route(_callbacks, t($gen_cast, _), _).to(handleCast);
    route(_callbacks, _, _).to(handleInfo);
});

function handleCall(ctx, callbackls, [$gen_call, from, call], state) {
    return callbacks.handleCall(ctx, call, from, state);
}
function handleCast(ctx, callbacks, [$gen_cast, cast], state) {
    return callbacks.handleCast(ctx, cast, state);
}
function handleInfo(ctx, callbacks, info, state) {
    return callbacks.handleInfo(ctx, info, state);
}

function startLink(ctx, callbacks) {
    return;
}
```

#### With Receive

`receive` accepts a pattern or list of patterns as its first argument. These patterns
are compiled if they are not already.

`receive` accepts multiple predicates to compare against incoming values for the
individual call. However, to determine which predicate was satisified, one would
need to re-run each predicate until one is matched.

`receiveWithPredicate` attempts to work around this issue using the following
pattern:

```javascript
import { Node, Symbols, compile, Pid } from '@otpjs/core';
const node = new Node();

const predicates = {
    justOK: compile(ok),
    okWithPid: compile([ok, Pid.isPid]),
    okWithRef: compile([ok, Ref.isRef]),
    okWithOther: compile([ok, _]),
};
const pid = node.spawn((ctx) => {
    const [message, predicate] = ctx.receiveWithPredicate([
        predicates.justOK,
        predicates.okWithPd,
        predicates.okWithRef,
        predicates.okWithOther,
    ]);

    if (predicate === predicates.okWithPid) {
        const [ok, pid] = message;
        // ...
    } else if (predicate === predicates.okWithRef) {
        const [ok, ref] = message;
        // ...
    } // ...
});
```
