# `@otpjs/transports-epmd`

Listens on an ephemeral port for incoming connections. Registers new connections with the provided `otpjs` node using `@otpjs/transports-tcp`. Publishes the `otpjs` node's name and
ephemeral port number on the specified `epmd` instance.

## Usage

### Installation

```sh
npm i @otpjs/transports-epmd
```

### Exports

#### `register(node: otp.Node, options = {})`

Creates a TCP server, listens for incoming connections, and registers said server with an `epmd` instance.

##### Options

| Parameter | Default                   | Description                                     |
| --------- | ------------------------- | ----------------------------------------------- |
| `bridge`  | `false`                   | Forwards node discovery messages, acts as relay |
| `type`    | `Symbol.for("temporary")` | Node persistence strategy                       |
| `epmd`    | See below                 | See below                                       |
| `tcp`     | See below                 | See below                                       |

###### EPMD Options

EPMD options regarding which `epmd` instance to connect to. Should be an object with the following properties:

| Parameter | Default       | Description                  |
| --------- | ------------- | ---------------------------- |
| `host`    | `"localhost"` | Host to connect to `epmd` on |
| `port`    | `4369`        | Port to connect to `epmd` on |

###### TCP Options

Object passed to created `@otpjs/transports-tcp` instances for incoming connections.

See the [`@otpjs/transports-tcp`](../tcp) README for available options.

### Registration

After initializing your `otpjs` node, invoke the `register` function to connect to `epmd` and publish your connection details.

```javascript
import epmd from '@otpjs/transports-epmd';

// build node

epmd.register(node, options);
```

### Teardown

`@otpjs/transports-epmd` maintains a persistent connection to the `epmd` instance, indicating
its lifecycle. In order to disconnect from the `epmd` instance, invoke the returned `destroy` function.

```javascript
const destroy = epmd.register(node, options);

// When you want to remove the published connection details and close the listener
destroy();
```
