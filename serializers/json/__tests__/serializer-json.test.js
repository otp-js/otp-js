'use strict';

require('../../../packages/test_utils');

const { Node } = require('@otpjs/core');
const { Pid, Ref, l, t } = require('@otpjs/types');
const serializerJson = require('../src/');

describe('@otpjs/serializer-json', () => {
    let node, ctx;
    let serialize, deserialize;

    beforeEach(function () {
        node = new Node();
        ctx = node.makeContext();
    });

    afterEach(function () {
        ctx.exit();
    });

    describe('with stringify disabled', function () {
        beforeEach(function () {
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
                        a: t(node.ref(), Pid.of(0, 1, 0, 1)),
                        b: l(1, 2, 3, 4, 5),
                        c: '2',
                    };

                    expect(serialize(object)).toMatchPattern({
                        a: [
                            '$otp.tuple',
                            [
                                [
                                    '$otp.ref',
                                    ['$otp.symbol', Symbol.keyFor(node.name)],
                                    0,
                                    0,
                                    1,
                                ],
                                [
                                    '$otp.pid',
                                    ['$otp.symbol', Symbol.keyFor(node.name)],
                                    1,
                                    0,
                                    1,
                                ],
                            ],
                        ],
                        b: ['$otp.list', [1, 2, 3, 4, 5], '$otp.list.nil'],
                        c: '2',
                    });
                });
            });
        });
        describe('and deserializing', function () {
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
                                deserialize(primitive);
                            }).not.toThrow();
                        });
                        it("doesn't change it", function () {
                            const out = deserialize(primitive);
                            expect(out).toBe(primitive);
                        });
                    });
                }
            });
            describe('arrays', function () {
                it("doesn't fail", function () {
                    const array = [];
                    expect(function () {
                        deserialize(array);
                    }).not.toThrow();
                });
            });
            describe('objects', function () {
                it("doesn't fail", function () {
                    const object = {};
                    expect(function () {
                        deserialize(object);
                    }).not.toThrow();
                });
                it('transforms properties', function () {
                    expect(
                        deserialize({
                            a: [
                                '$otp.tuple',
                                [
                                    [
                                        '$otp.ref',
                                        [
                                            '$otp.symbol',
                                            Symbol.keyFor(node.name),
                                        ],
                                        0,
                                        0,
                                        1,
                                    ],
                                    [
                                        '$otp.pid',
                                        [
                                            '$otp.symbol',
                                            Symbol.keyFor(node.name),
                                        ],
                                        1,
                                        0,
                                        1,
                                    ],
                                ],
                            ],
                            b: ['$otp.list', [1, 2, 3, 4, 5], '$otp.list.nil'],
                            c: '2',
                        })
                    ).toMatchPattern({
                        a: t(node.ref(), Pid.of(0, 1, 0, 1)),
                        b: l(1, 2, 3, 4, 5),
                        c: '2',
                    });
                });
            });
        });
    });
});
