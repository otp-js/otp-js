"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.make = make;

var _encoder = _interopRequireDefault(require("./encoder"));

var _parser = _interopRequireDefault(require("./parser"));

function make(node, options) {
  const encode = (0, _encoder.default)(node, options);
  const parse = (0, _parser.default)(node, options);
  return {
    serialize: encode,
    deserialize: parse,
    encode,
    parse
  };
}