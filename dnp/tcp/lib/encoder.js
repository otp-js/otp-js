"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = make;

var _stream = require("stream");

var serializer = _interopRequireWildcard(require("@otpjs/serializer-ertf"));

var _debug = _interopRequireDefault(require("debug"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const log = (0, _debug.default)('otpjs:transports:tcp:encoder');

function defaultOptions(node) {
  return {
    atomCache: [],
    ERTF: serializer.make(node)
  };
}

function make(node, options = defaultOptions(node)) {
  const {
    ERTF
  } = options;
  const transformer = new _stream.Transform({
    writableObjectMode: true,

    async transform(data, _encoding, callback) {
      log('transform(data: %o)', data);
      const {
        heartbeat,
        message,
        control
      } = data;

      if (heartbeat) {
        log('transform(heartbeat)');
        this.push(Buffer.alloc(4, 0));
        return;
      }

      let buff = ERTF.serialize(control, {
        tag: true
      });

      if (message) {
        let buff2 = ERTF.serialize(message, {
          tag: true
        });
        buff = Buffer.concat([buff, buff2]);
      }

      const length = Buffer.alloc(4);
      length.writeUInt32BE(buff.length + 1);
      const packet = Buffer.concat([length, Buffer.from([0x70]), buff]);
      log('transform(packet: %o, control: %o, message: %o)', packet, control, message);
      this.push(packet);
      callback(null);
    }

  });
  return transformer;
}