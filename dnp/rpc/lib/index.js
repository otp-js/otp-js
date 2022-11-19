"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.start = start;
exports.startLink = startLink;
exports.stop = stop;

const otp = require('@otpjs/core');

const gen_server = require('@otpjs/gen_server');

const {
  ok,
  _
} = otp.Symbols;
const {
  reply,
  noreply,
  stop: $stop
} = gen_server.Symbols;
const $NAME = Symbol.for('rex');

function start(ctx) {
  return gen_server.start(ctx, ['local', $NAME], callbacks, []);
}

function startLink(ctx) {
  return gen_server.startLink(ctx, ['local', $NAME], callbacks, []);
}

function stop(ctx, rpc = $NAME) {
  return gen_server.call(ctx, rpc, stop, Infinity);
}

function _init(ctx) {
  return [ok, new Map()];
}

async function _call(ctx, [, fun, args, gleader], from, state) {
  const exec = async function (ctx) {
    await setGroupLeader(ctx, gleader);
    const leaderBeforeCall = await ctx.groupLeader();
    const response = executeCall(ctx, fun, args);
    const compare = otp.caseOf(gleader);

    if (compare([send_stdout_to_caller, _])) {
      const ref = ctx.makeRef();
      ctx.send(leaderBeforeCall, [stop, ctx.self(), ref, from, reply]);
      await ctx.receive(ref, () => ok);
    } else {
      gen_server.reply(ctx, from, reply);
    }
  };

  const [pid, mref] = await ctx.spawnMonitor(ctx, exec);
  return [noreply, state.set(mref, from)];
}

async function _blockCall(ctx, [, fun, args, nextGLeader], _from, state) {
  const gleader = await ctx.groupLeader();
}