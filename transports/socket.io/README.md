# Open Telecom Platform on JS

## `@otpjs/transports-socket.io`

Enables communication with an `otpjs` node on the other side of a `socket.io` connection.

### Usage

#### Installation

```sh
npm i @otpjs/transports-socket.io
```

#### Exports

##### `register(node: otp.Node, socket: socketIO.Socket, options = {})`

Builds a relay process on `node` for `socket` to provide inter-node communication.

###### Options

| Parameter | Default                   | Description                                     |
| --------- | ------------------------- | ----------------------------------------------- |
| `bridge`  | `false`                   | Forwards node discovery messages, acts as relay |
| `type`    | `Symbol.for("temporary")` | Node persistence strategy                       |

#### Registration

Both sides of the transport must register the socket with `@otpjs/transports-socket.io`.

```javascript
import otpOnSocketIO = require('@otpjs/transports-socket.io');

// stand up your socket.io server or client and otpjs node
// server
io.on('connect', (socket) => {
    otpOnSocketIO.register(node, socket, options);
})

// client
const socket = io();
otpOnSocketIO.register(node, socket, options);
```

#### Teardown

`@otpjs/transports-socket.io` handles disconnects gracefully. On disconnect, the remote node
is deregistered from the local node. On reconnect, registers a node again.

To permanently destroy a node, invoke the returned `destroy` function.

```javascript
const destroy = otpOnSocketIO(node, socket, options);

// When you want to permanently remove the node
destroy();
```
