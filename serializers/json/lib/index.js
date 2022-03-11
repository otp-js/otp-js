"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deserialize = deserialize;
exports.serialize = serialize;

var _types = require("@otpjs/types");

var _matching = require("@otpjs/matching");

const {
  _
} = _matching.Symbols;

function deserialize(string, reviver = undefined) {
  if (reviver) {
    reviver = kvCompose((key, value) => reviveOTP(key, value, reviver), reviver);
  } else {
    reviver = reviveOTP;
  }

  return JSON.parse(string, reviver);
}

function serialize(data, replacer = undefined) {
  if (replacer) {
    replacer = kvCompose((key, value) => replaceOTP(key, value, replacer), replacer);
  } else {
    replacer = replaceOTP;
  }

  return JSON.stringify(data, replacer);
}

function kvCompose(...funs) {
  return funs.reduceRight((acc, fun) => (key, value) => fun(key, acc(key, value)), (_key, value) => value);
}

function reviveOTP(key, value) {
  const compare = (0, _matching.caseOf)(value);

  if (compare(['$otp.symbol', _])) {
    return Symbol.for(value[1]);
  } else if (compare(['$otp.function', _, _])) {
    return new (Function.bind.apply(Function, [Function].concat(value[1], [value[2]])))();
  } else if (compare(['$otp.pid', _])) {
    return new _types.Pid(value[1]);
  } else if (compare(['$otp.ref', _])) {
    return new _types.Ref(value[1]);
  } else if (compare(['$otp.list', _, _])) {
    return (0, _types.improperList)(...value[1], value[2]);
  } else if (compare(['$otp.tuple', _])) {
    return (0, _types.tuple)(...value[1]);
  } else {
    return value;
  }
}

const isSymbol = v => typeof v === 'symbol';

const isFunction = v => typeof v === 'function';

function replaceOTP(key, value) {
  const compare = (0, _matching.caseOf)(value);

  if (compare(isSymbol)) {
    const key = Symbol.keyFor(value);

    if (key) {
      return ['$otp.symbol', key];
    } else {
      return undefined;
    }
  } else if (compare(isFunction)) {
    const parts = value.toString().match(/^\s*(?:function)?[^(]*\(?([^]*?)\)\s*(?:=>)?\s*{?([^]*?)}?\s*$/);
    if (parts == null) throw 'Function form not supported';
    return ['$otp.function', parts[1].trim().split(/\s*,\s*/), parts[2].replace(/\s+/, ' ')];
  } else if (compare(_types.Pid.isPid)) {
    return ['$otp.pid', value.toString()];
  } else if (compare(_types.Ref.isRef)) {
    return ['$otp.ref', value.toString()];
  } else if (_types.list.isList(value) && value != _types.list.nil) {
    let result = [];
    let node = value;

    while (_types.list.isList(node) && node != _types.list.nil) {
      result.push(node.head);
      node = node.tail;
    }

    let tail = node;
    return ['$otp.list', result, tail];
  } else if (_types.tuple.isTuple(value)) {
    return ['$otp.tuple', Array.from(value)];
  } else {
    return value;
  }
}