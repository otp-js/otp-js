# Open Telecom Platform on JS

[![Build Status](https://travis-ci.com/otp-js/otp-js.svg?branch=main)](https://travis-ci.com/otp-js/otp-js)
[![Coverage Status](https://coveralls.io/repos/github/otp-js/otp-js/badge.svg?branch=main)](https://coveralls.io/github/otp-js/otp-js?branch=main)

This project makes heavy use of ES6 features and as such requires NodeJS v16

This is an endeavor to replicate the Open Telecom Platform in NodeJS. This
implementation tries to bridge the gap between the two languages by implementing
what is essentially the Erlang Standard Library: OTP.

## Conventions

### Symbols

We use ES6 symbols to effectively replicate the behavior of atoms in Erlang.

Distinguish atoms/symbols from other terms by using `snake_case`.

### Variables

ES6 and Erlang differ fundamentally with respect to mutability. We can mitigate
the impact of these differences by adopting programming practices that eschew
mutability. If we make shallow copies when modifying values instead of modifying
a reference value, we can enjoy the benefits of immutability.

Erlang takes immutability a step further, not allowing you to rebind a variable
in a single scope. We can use `let` to accommodate such usage in ES6, however,
we will still prefer `const` when it makes sense.

### Functions

Export functions with names written in `camelCase`.

Prefix internal versions of functions with an underscore (e.g., `_privateMethod()`).

### Pattern Matching

We provide pattern matching functionality in [`@otpjs/matching`](/packages/matching).

### Object-Oriented Programming

OOP is orthoganal to the idioms expressed in these libraries, which makes it a potent
tool when used appropriately. As such, blending of the idioms in this library with
an object-oriented approach is actively encouraged, and future changes to behaviors
may introduce object-oriented actors as an alternative to the pure functional API
currently provided.

## Processes

### Lifecycle

As in Erlang, every process has a unique identifier associated with it, as well
as message queues.

In ES6, we treat `Promise` chains as process threads with an accompanying
`Context` object (typically written as `ctx`). As long as you continue returning
promises, your `Context` remains alive and able to send and receive signals. Once
your `Promise` resolves or rejects, your `Context` dies and can no longer send or
receive signals.

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
