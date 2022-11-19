"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.register = register;

var _core = require("@otpjs/core");

var net = _interopRequireWildcard(require("net"));

var ertf = _interopRequireWildcard(require("@otpjs/transports-ertf"));

var _epmdClient = _interopRequireDefault(require("@otpjs/epmd-client"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const {
  relay,
  monitor,
  shutdown,
  DOWN,
  _,
  trap_exit,
  discover,
  temporary,
  lost
} = _core.Symbols;

function log(ctx, ...args) {
  return ctx.log.extend('transports:epmd')(...args);
}

function defaultOptions() {
  return {
    bridge: false,
    type: temporary,
    epmd: {
      host: 'localhost',
      port: 4369
    }
  };
}

function register(node, options = defaultOptions()) {
  let ctx = node.makeContext();
  log(ctx, 'register(%o) : net.createServer()', node.name);
  const server = net.createServer(socket => ertf.register(node, socket, options));
  log(ctx, 'register(%o) : server.listen()', node.name);
  server.listen(async () => {
    const host = options.epmd?.host ?? 'localhost';
    const port = options.epmd?.port ?? 4369;
    log(ctx, 'register(%o) : new epmd.Client(%o, %o)', node.name, host, port);
    const client = new _epmdClient.default.Client(host, port);
    log(ctx, 'register(%o) : client.connect()', node.name);
    await new Promise((resolve, reject) => {
      client.connect();
      client.on('connect', socket => {
        log(ctx, 'register(%o) : client.register()', node.name);
        client.register(server.address().port, Symbol.keyFor(node.name).split(/@/)[0]);
        resolve();
      });
      client.on('error', reject);
    });
  });
  return function destroy(reason = shutdown) {
    try {
      server.close();
    } catch (err) {
      log(ctx, 'destroy(%o) : error : %o', reason, err);
    } finally {
      ctx.die(reason);
    }
  };
}