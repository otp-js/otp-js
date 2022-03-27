# Open Telecom Platform on JS

## ERTF Serialization

This module provides serialization/deserialization functionality for Erlang's External Term Format.

### Installation

```sh
npm i @otpjs/serializer-ertf
```

### Usage

#### Initializing

In order to be able to properly serialize/deserialize Pids and Refs, you must initialize `@otpjs/serializer-ertf` with an instance of `Node` from `@otpjs/core`.

```javascript
import { Node } from '@otpjs/core';
import makeERTF from '@otpjs/serializer-ertf';

const node = new Node();
const ERTF = makeERTF();
```

#### `serialize`/`encode`

Encodes a JavaScript value as an Erlang term stored in a `Buffer`. Understands types from `@otpjs/types` as well.

```javascript
import { t, l } from '@otpjs/types';

// Integers will serialize into the fewest number of bytes. BigInts are also supported.
ERTF.serialize(1); // <Buffer 83 61 01>
ERTF.serialize(100000000000); // <Buffer 83 6e 08 00 00 00 00 00 17 48 76 e8>
ERTF.serialize(100000000000000000000n); // <Buffer 83 6e 0a 00 00 00 05 6b c7 5e 2d 63 10 00>

// Floats will serialize into doubles.
ERTF.serialize(1.33333); // <Buffer 83 46 3f f5 55 51 d6 8c 69 2f>

// By default, strings will serialize into LISTS, which will become evident during deserialization
const buff = ERTF.serialize('hello, world!'); // <Buffer 83 6b 00 0d 68 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21>
ERTF.deserialize(buff); // [ 104, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33 ]

// ...with the `stringsAsBinaries` option set to `true`, you will receive a buffer instead
const buff = ERTF.serialize('hello, world!'); // <Buffer 83 6d 00 00 00 0d 68 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21>
ERTF.deserialize(buff); // <Buffer 68 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21>

// ...with the 'binariesAsStrings' option set to also `true`, you will receive a UTF-8 string
const buff = ERTF.serialize('hello, world!'); // <Buffer 83 6d 00 00 00 0d 68 65 6c 6c 6f 2c 20 77 6f 72 6c 64 21>
ERTF.deserialize(buff); // 'hello, world!'
```

#### `deserialize`/`parse`

Decodes a `Buffer` containing an ERTF-encoded value into native Javascript types.

```javascript
import { t, l } from '@otpjs/types';

ERTF.deserialize(Buffer.from([0x83, 0x61, 0x01])); // 0x1
ERTF.deserialize(
    Buffer.from(
        [0x83, 0x6e, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17, 0x48, 0x76, 0xe8]
            .map(String.fromCharCode)
            .join('')
    )
); // 100000000000n
```

### Complex Type Support

Current support for complex Javascript types is limited to the types published in `@otpjs/types`, including `Tuple` and `List`.

Support for maps (raw `Object` and `Map` instances) is forthcoming. Seeking input on how to treat `Array`: is it a tuple or a list? Neither is a perfect fit.
