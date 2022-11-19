"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.start = start;
exports.startLink = startLink;
exports.sync = sync;

var otp = _interopRequireWildcard(require("@otpjs/core"));

var gen_server = _interopRequireWildcard(require("@otpjs/gen_server"));

var matching = _interopRequireWildcard(require("@otpjs/matching"));

var _types = require("@otpjs/types");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const {
  ok,
  _,
  error
} = otp.Symbols;
const {
  reply,
  noreply
} = gen_server.Symbols;
const global_name_server = Symbol.for('global_name_server');
const registrar = Symbol.for('registrar');
const $sync = Symbol.for('sync');
const all = Symbol.for('all');
const callbacks = gen_server.callbacks(server => {
  server.onInit(_init);
  server.onCall((0, _types.t)(registrar, _), _forwardMethod);
});
const syncDecision = matching.buildCase(is => {
  is((0, _types.t)(error, _), (ctx, [, error]) => error);
  is(_, (ctx, nodes) => gen_server.call(ctx, global_name_server, (0, _types.t)($sync, nodes), Infinity));
});

async function sync(ctx, nodes) {
  const response = await checkSyncNodes(nodes);
  const next = syncDecision.for(response);
  return next(ctx, response);
}

const checkSyncDecision = matching.buildCase(is => {
  is((0, _types.t)(ok, all), ctx => ctx.nodes());
  is((0, _types.t)(ok, _), (ctx, [, groupNodes]) => intersection(ctx.nodes(), groupNodes));
  is((0, _types.t)(error, _), (ctx, [, err]) => err);
});

async function checkSyncNodes(syncNodes) {
  const own = await getOwnNodes();
  const next = checkSyncDecision.for(own);
  return next(ctx, own);
}

function _init(ctx) {
  return (0, _types.t)(ok, {});
}

function _forwardMethod(ctx, call, from, state) {
  return (0, _types.t)(noreply, state);
}

function start(ctx) {
  return gen_server.start(ctx, (0, _types.t)('local', global_name_server), callbacks, []);
}

function startLink(ctx) {
  return gen_server.startLink(ctx, (0, _types.t)('local', global_name_server), callbacks, []);
}