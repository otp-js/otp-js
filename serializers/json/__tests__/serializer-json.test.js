'use strict';

require('../../../packages/test_utils');

const { Node } = require('@otpjs/core');
const { Pid, Ref, l, t } = require('@otpjs/types');
const serializerJson = require('../src/');

describe('@otpjs/serializer-json', () => {
    let node, ctx;
    let serialize, deserialize;

    beforeAll(function () {
        node = new Node();
        ctx = node.makeContext();
    });

    afterAll(function () {
        ctx.exit();
    });

    describe('with stringify disabled', function () {
        beforeAll(function () {
            const serdes = serializerJson.make(node, { stringify: false });
            serialize = serdes.serialize;
            deserialize = serdes.deserialize;
        });

        describe('and serializing', function () {
            describe('primitves', function () {
                let primitives = [
                    99999999n,
                    34234,
                    98.6,
                    'string',
                    false,
                    undefined,
                ];

                for (let primitive of primitives) {
                    describe(`of type ${typeof primitive}`, function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(primitive);
                            }).not.toThrow();
                        });
                        it("doesn't change it", function () {
                            const out = serialize(primitive);
                            expect(out).toBe(primitive);
                        });
                    });
                }
            });
            describe('otp types', function () {});
            describe('arrays', function () {
                it("doesn't fail", function () {
                    const array = [];
                    expect(function () {
                        serialize(array);
                    }).not.toThrow();
                });
            });
            describe('objects', function () {
                it("doesn't fail", function () {
                    const object = {};
                    expect(function () {
                        serialize(object);
                    }).not.toThrow();
                });
                it('transforms properties', function () {
                    const object = {
                        a: Pid.of(0, 1, 0, 1),
                        b: 1,
                        c: '2',
                    };

                    expect(serialize(object)).toMatchPattern({
                        a: [
                            '$otp.pid',
                            ['$otp.symbol', Symbol.keyFor(node.name)],
                            1,
                            0,
                            1,
                        ],
                        b: 1,
                        c: '2',
                    });
                });
            });
        });
    });
});
