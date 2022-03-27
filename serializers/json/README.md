# Open Telecom Platform on JS

## JSON Serialization

This module provides extended JSON serialization/deserialization functionality.

### Installation

```sh
npm i @otpjs/serializer-json
```

### Usage

#### Initializing

In order to be able to properly serialize/deserialize Pids and Refs, you must initialize `@otpjs/serializer-json` with an instance of `Node` from `@otpjs/core`.

```javascript
import { Node } from '@otpjs/core';
import makeJSON from '@otpjs/serializer-json';

const node = new Node();
const JSON = makeJSON(node);
```

#### `serialize`/`encode`

Encodes a JavaScript value as an Erlang term stored in a `Buffer`. Understands types from `@otpjs/types` as well.

```javascript
import { t, l } from '@otpjs/types';

// When serializing complex types, "tags" the output
JSON.serialize(t(1, 2, 3)); // ["$otp.tuple", [1, 2, 3]]
JSON.serialize(l(1, 2, 3)); // ["$otp.list", [1, 2, 3], "$otp.list.nil"]
JSON.serialize(Pid.of(0, 1, 2, 3)); // ["$otp.pid", ["$otp.symbol", "otp-0@127.0.0.1"], 1, 2, 3]
```

#### `deserialize`/`parse`

Decodes a `String` containing a JSON-encoded value into native types. Resaturates complex types when encountered
in the JSON structure.

```javascript
import { t, l } from '@otpjs/types';

JSON.deserialize(['$otp.list', [1, 2, 3], '$otp.list.nil']); // [1, 2, 3]
JSON.deserialize(['$otp.pid', ['$otp.symbol', 'otp-0@127.0.0.1'], 1, 2, 3]); // Pid<0.1.2>
```

### Complex Type Support

Current limited support for complex Javascript types to the types published in `@otpjs/types`, including `Tuple` and `List`.

Support for maps (raw `Object` and `Map` instances) is forthcoming. Seeking input on how to treat `Array`: is it a tuple or a list? Neither is a perfect fit.
