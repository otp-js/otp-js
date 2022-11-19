# `@otpjs/transports-tcp`

Implements the Erlang Distribution Protocol over TCP. Use with existing sockets or to create
new connections to Erlang or `otpjs` nodes.

## Usage

### Installation

```sh
npm i @otpjs/transports-tcp
```

### Exports

#### `register(node: otp.Node, socket, options = {})`

Initiates a DSP handshake over `socket`. On success, builds a relay process on `node`
for `socket` to provide inter-node communication.

##### Options

No options are currently considered, but may be available in the future.

#### `connect(node: otp.Node, { host: string, port: number }, options = {})`

Connects to node with the `net` module. After a successful handshake, builds a relay
process on `node` for `socket` to provide inter-node communication.

##### Options

No options are currently considered, but may be available in the future.

### Registration

After initializing your `otpjs` node, invoke the `register` function to connect to `epmd` and publish your connection details.

```javascript
import epmd from '@otpjs/transports-epmd';

// build node

// actively connect
tcp.connect(node, { host: 'some.erlang.node', port: 39458 }, options); // Port is probably ephemeral

// register existing connection (e.g., as `@otpjs/transports-epmd` does)
tcp.register(node, socket, options);
```

### Teardown

`@otpjs/transports-tcp` handles disconnects gracefully. On disconnect, the remote
node is deregistered from the local node. If you wish to actively destroy the connection,
invoke the returned `destroy` function.

```javascript
const destroy = tcp.connect(node, hostPort, options);

// To break the connection...

destroy();
```
