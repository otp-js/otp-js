# `@otpjs/types`

A collection of types used in the `otpjs` ecosystem.

## Usage

### Installation

```sh
npm i @otpjs/types
```

### Usage

```javascript
// Full specification
import { Tuple, List, improperList, Pid, Ref, OTPError } from '@otpjs/types';

// Shorthand helpers
import { t, l, il, cons, cdr, car } from '@otpjs/types';
```

#### `Tuple`/`t`

Composes a tuple from an arbitrary number of terms. Internal implementation is an array, but cannot expand.

```javascript
const tuple = t(1, 2, 3); // {1, 2, 3}

// Accessors are 0 indexed
tuple.get(1); // 2
tuple[2]; // 3

// Update a value
tuple.set(0, 2); // {2, 2, 3}
tuple[2] = 4; // {1, 2, 4}

// Iterable
for (let term of tuple) {
    // ...
}

// Destructuring assignment
const [a, b, c] = t(1, 2, 3);
```

#### `List` and helpers

A `List` is a singly-linked list.

##### Helpers

###### `nil`

A special symbol represents `nil`, or an empty list. We wrap this symbol in an `Object` to
provide certain functionality.

###### `l`

Equivalent to `List.from`. Accepts an arbitrary number of elements and composes a list from them.

```javascript
const list = l(1, 2, 3, 4, 5, 6); // [1, 2, 3, 4, 5, 6]
```

###### `improperList`/`il`

Create an "improper" list with a non-list, non-nil tail. Accepts an arbitrary number of elements. The last element provided will be the tail.

```javascript
const improper = il(1, 2); // [ 1 | 2 ]
```

###### `cons`

Construct a new list node from an element (the head) and an existing list (the tail). Can construct improper lists.

```javascript
let list = cons(0, nil); // [0]
list = cons(1, list); // [1, 0]
list = cons(2, list); // [2, 1, 0]
```

###### `car`/`cdr`

These helpers access the head and tail of a list node.

`car` accesses the head.
`cdr` accesses the tail.
