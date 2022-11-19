"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.connect = connect;
exports.register = register;

var otp = _interopRequireWildcard(require("@otpjs/core"));

var matching = _interopRequireWildcard(require("@otpjs/matching"));

var _types = require("@otpjs/types");

var _parser = _interopRequireDefault(require("./parser"));

var _encoder = _interopRequireDefault(require("./encoder"));

var _serializerErtf = require("@otpjs/serializer-ertf");

var net = _interopRequireWildcard(require("net"));

var handshake = _interopRequireWildcard(require("./handshake"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const TRANSPORT_COST = 1;

function log(ctx, ...formatters) {
  return ctx.log.extend('transports:ertf')(...formatters);
}

const {
  monitor,
  demonitor,
  link,
  unlink,
  EXIT,
  DOWN,
  relay
} = otp.Symbols;
const {
  _
} = matching.Symbols;

const isAtom = value => typeof value === 'symbol';

async function register(node, socket, options) {
  socket.setNoDelay(true);
  const ctx = node.makeContext();
  const nodeInformation = await handshake.receive(node, ctx, socket, options);
  await node.registerRouter(ctx.node(), TRANSPORT_COST, nodeInformation.name, ctx.self(), {
    bridge: false
  });
  return _handleSocket(node, ctx, socket, Buffer.alloc(0), { ...options,
    nodeInformation
  });
}

async function connect(node, {
  host,
  port
}, options) {
  const ctx = node.makeContext();
  const socket = net.connect(port);
  socket.setNoDelay(true);
  const [nodeInformation, chunk] = await handshake.initiate(node, ctx, socket, options);
  log(ctx, 'connect(nodeInformation: %o)', nodeInformation);
  await node.registerRouter(ctx.node(), TRANSPORT_COST, nodeInformation.name, ctx.self(), {
    bridge: false
  });
  return _handleSocket(node, ctx, socket, chunk, { ...options,
    nodeInformation
  });
}

function _handleSocket(node, ctx, socket, leadChunk, options) {
  const {
    nodeInformation
  } = options;
  const ERTF = (0, _serializerErtf.make)(node);
  let unlinks = 0;
  const forward = matching.clauses(function routeForward(route) {
    route((0, _types.t)(relay, _, _types.Pid.isPid, _)).to(_relayToPid);
    route((0, _types.t)(relay, _, isAtom, _)).to(_relayToName);
    route((0, _types.t)(link, _, _)).to(_link);
    route((0, _types.t)(unlink, _, _)).to(_unlink);
    route((0, _types.t)(monitor, _, _)).to(_monitor);
    route((0, _types.t)(demonitor, _, _)).to(_demonitor);
    route((0, _types.t)(EXIT, _, _, _)).to(_EXIT);
    route((0, _types.t)(DOWN, _, _, _, _)).to(_DOWN);

    function _relayToPid([, to, message]) {
      const control = (0, _types.t)(2, _types.l.nil, to);
      encoder.write({
        control,
        message
      });
    }

    function _relayToName([, fromPid, toProc, message]) {
      const control = (0, _types.t)(6, fromPid, _types.l.nil, toProc);
      encoder.write({
        control,
        message
      });
    }

    function _link([, fromPid, toPid]) {
      const control = (0, _types.t)(1, fromPid, toPid);
      encoder.write({
        control
      });
    }

    function _unlink([, fromPid, toPid]) {
      const id = unlinks++;
      const control = (0, _types.t)(35, id, fromPid, toPid);
      encoder.write({
        control
      });
    }

    function _monitor([, fromPid, toProc, ref]) {
      const control = (0, _types.t)(19, fromPid, toProc, ref);
      encoder.write({
        control
      });
    }

    function _demonitor([, fromPid, toProc, ref]) {
      const control = (0, _types.t)(20, fromPid, toProc, ref);
      encoder.write({
        control
      });
    }

    function _EXIT([, fromPid, toPid, reason]) {
      const control = (0, _types.t)(3, fromPid, toPid, reason);
      encoder.write({
        control
      });
    }

    function _DOWN([, fromProc, toPid, ref, reason]) {
      const control = (0, _types.t)(21, fromProc, toPid, ref, reason);
      encoder.write({
        control
      });
    }
  });
  const process = matching.clauses(function routeProcess(route) {
    route((0, _types.t)(relay, _)).to(([, op]) => forward(op));
    return 'tcp.process';
  });
  const receive = matching.clauses(route => {
    route((0, _types.t)(1, _types.Pid.isPid, _types.Pid.isPid)).to(_link);
    route((0, _types.t)(2, _, _types.Pid.isPid), _).to(_relay);
    route((0, _types.t)(3, _types.Pid.isPid, _types.Pid.isPid, _)).to(_exit);
    route((0, _types.t)(4, _types.Pid.isPid, _types.Pid.isPid)).to(_unlink);
    route((0, _types.t)(5)).to(_linkNode);
    route((0, _types.t)(6, _types.Pid.isPid, _, isAtom), _).to(_relayName);
    route((0, _types.t)(7, _types.Pid.isPid, _types.Pid.isPid)).to(_groupLeader);
    route((0, _types.t)(8, _types.Pid.isPid, _types.Pid.isPid, _)).to(_exit2);
    route((0, _types.t)(19, _types.Pid.isPid, _, _types.Ref.isRef)).to(_monitor);
    route((0, _types.t)(20, _types.Pid.isPid, _, _types.Ref.isRef)).to(_demonitor);
    route((0, _types.t)(21, _, _types.Pid.isPid, _types.Ref.isRef, _)).to(_monitorExit);
    return 'receive';

    function _link([, fromPid, toPid]) {
      node.link(fromPid, toPid);
    }

    function _relay([, cookie, toPid], message) {
      node.deliver(toPid, message);
    }

    function _exit([, fromPid, toPid, reason]) {
      node.deliver(toPid, (0, _types.t)(EXIT, fromPid, reason, Error().stack));
    }

    function _unlink([, fromPid, toPid]) {
      node.unlink(fromPid, toPid);
    }

    function _linkNode() {// TODO: finalizer? beforeExit?
    }

    function _relayName([, fromPid, _unused, toProc], message) {
      node.deliver(fromPid, toProc, message);
    }

    function _groupLeader([, fromPid, toPid]) {// TODO: implement group leaders
    }

    function _exit2([, fromPid, toPid, reason]) {
      node.signalExit(fromPid, toPid, reason);
    }

    function _monitor([, fromPid, toProc, ref]) {
      const toPid = node.whereis(toProc);

      if (toPid) {
        node.monitor(fromPid, toPid, ref);
      } else {
        node.deliver(fromPid, (0, _types.t)(DOWN, toProc, 'process', 'noproc', Error().stack));
      }
    }

    function _demonitor([, fromPid, toProc, ref]) {
      node.demonitor(fromPid, toProc, ref);
    }

    function _monitorExit([, fromProc, toPid, reason]) {
      node.deliver(toPid, (0, _types.t)(DOWN, fromProc, 'process', reason, Error().stack));
    }
  });
  let running = true;
  log(ctx, '_handleSocket(self: %o, nodeInformation: %o)', ctx.self(), nodeInformation);
  const encoder = (0, _encoder.default)(node, {
    ERTF
  });
  encoder.on('data', data => {
    if (data.length > 4) {
      const [control, rest] = ERTF.parse(data.subarray(5));
      const [message] = rest.length > 0 ? ERTF.parse(rest) : [];
      log(ctx, 'encoder.on(control: %o, message: %o)', control, message);
    }

    socket.write(data);
  });
  socket.on('drain', data => {
    log(ctx, 'socket.on(drain: %o)', data);
  });
  socket.on('error', err => {
    log(ctx, 'socket.on(error: %o)', err);
  });
  socket.on('close', err => {
    running = false;
    node.unregisterRouter(ctx.self());
    socket.destroy();
    ctx.die('disconnect');
  }); //encoder.pipe(socket);

  const parser = (0, _parser.default)(node, {
    ERTF
  });
  parser.write(leadChunk);
  socket.pipe(parser);
  parser.on('data', data => {
    log(ctx, '_handleSocket(%o) : parser.on(data, %o)', ctx.self(), data);

    if (data.type === 'heartbeat') {
      const message = Buffer.alloc(4, 0);
      log(ctx, '_handleSocket(%o) : parser.on(data, %o) : encoder.write(%o)', ctx.self(), data, message);
      encoder.write({
        heartbeat: true
      });
    } else {
      receive(data.control, data.message);
    }
  });
  recycle();

  function recycle() {
    if (running) {
      ctx.receive().then(process).then(recycle).catch(err => log(ctx, 'recycle() : error : %o', err));
    }
  }
}