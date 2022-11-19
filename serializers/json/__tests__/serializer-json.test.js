'use strict';

require('../../../packages/test_utils');

const { Node, Symbols } = require('@otpjs/core');
const { Pid, Ref, l, t } = require('@otpjs/types');
const serializerJson = require('../src/');

const { ok } = Symbols;

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

    describe('with stringify enabled', function () {
        beforeEach(function () {
            const serdes = serializerJson.make(node, { stringify: true });
            serialize = serdes.serialize;
            deserialize = serdes.deserialize;
        });

        describe('and serializing', function () {
            describe('primitves', function () {
                let primitives = [
                    { raw: 34234, serialized: '34234' },
                    { raw: 98.6, serialized: '98.6' },
                    { raw: 'string', serialized: '"string"' },
                    { raw: false, serialized: 'false' },
                    { raw: null, serialized: 'null' },
                ];

                for (let primitive of primitives) {
                    describe(`of type ${typeof primitive}`, function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(primitive.raw);
                            }).not.toThrow();
                        });
                        it('makes a string of it', function () {
                            const out = serialize(primitive.raw);
                            expect(out).toBe(primitive.serialized);
                        });
                    });
                }

                describe('of type symbol', function () {
                    describe('with a key', function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(Symbol.for('ok'));
                            }).not.toThrow();
                        });
                        it('can encode', function () {
                            expect(serialize(Symbol.for('ok'))).toBe(
                                '["$otp.symbol","ok"]'
                            );
                        });
                    });
                    describe('without a key', function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(Symbol());
                            }).not.toThrow();
                        });
                        it('cannot encode', function () {
                            expect(serialize(Symbol())).toBe(undefined);
                        });
                    });
                });
            });
            describe('otp types', function () {
                describe('tuples', function () {
                    it('transforms all elements', function () {
                        const encodedTuple =
                            '["$otp.tuple",[["$otp.list",[1,2,3],"$otp.list.nil"],["$otp.tuple",[["$otp.symbol","ok"],{"a":1,"b":2,"c":["$otp.list",["a","b","c"],"$otp.list.nil"]}]],["1","2","3"]]]';
                        const realTuple = t(
                            l(1, 2, 3),
                            t(ok, { a: 1, b: 2, c: l('a', 'b', 'c') }),
                            ['1', '2', '3']
                        );

                        expect(serialize(realTuple)).toMatchPattern(
                            encodedTuple
                        );
                    });
                });
            });
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
                describe('with toJSON', function () {
                    it('uses the result', function () {
                        const obj = {
                            value: 42,
                            toJSON() {
                                return this.value;
                            },
                        };

                        expect(serialize(obj)).toBe('42');
                    });

                    it('walks the result', function () {
                        const obj = {
                            value: t(ok, 42),
                            toJSON() {
                                return this.value;
                            },
                        };

                        expect(serialize(obj)).toBe(
                            '["$otp.tuple",[["$otp.symbol","ok"],42]]'
                        );
                    });
                });
                describe('with no toJSON', function () {
                    it('transforms properties', function () {
                        const object = {
                            a: t(node.ref(), Pid.of(0, 1, 0, 1)),
                            b: l(1, 2, t('a', 'b', 'c'), 4, 5),
                            c: '2',
                            d: {
                                value: t(ok, 42),
                            },
                        };

                        const encodedObject = `{"a":["$otp.tuple",[["$otp.ref",["$otp.symbol","${Symbol.keyFor(
                            node.name
                        )}"],0,0,1],["$otp.pid",["$otp.symbol","${Symbol.keyFor(
                            node.name
                        )}"],1,0,1]]],"b":["$otp.list",[1,2,["$otp.tuple",["a","b","c"]],4,5],"$otp.list.nil"],"c":"2","d":{"value":["$otp.tuple",[["$otp.symbol","ok"],42]]}}`;

                        expect(serialize(object)).toMatchPattern(encodedObject);
                    });
                });
            });
        });
        describe('and deserializing', function () {
            describe('primitves', function () {
                let primitives = [
                    { raw: 34234, serialized: '34234' },
                    { raw: 98.6, serialized: '98.6' },
                    { raw: 'string', serialized: '"string"' },
                    { raw: false, serialized: 'false' },
                    { raw: null, serialized: 'null' },
                ];

                for (let primitive of primitives) {
                    describe(`of type ${typeof primitive}`, function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                deserialize(primitive.serialized);
                            }).not.toThrow();
                        });
                        it('converts it', function () {
                            const out = deserialize(primitive.serialized);
                            expect(out).toBe(primitive.raw);
                        });
                    });
                }

                describe('of type symbol', function () {
                    it("doesn't fail", function () {
                        expect(function () {
                            deserialize('["$otp.symbol","ok"]');
                        }).not.toThrow();
                    });
                    it('can decode', function () {
                        expect(
                            deserialize('["$otp.symbol","ok"]')
                        ).toMatchPattern(ok);
                    });
                    it('has a key', function () {
                        const symbol = deserialize('["$otp.symbol","ok"]');
                        expect(Symbol.keyFor(symbol)).not.toBe(undefined);
                    });
                });
            });
            describe('arrays', function () {
                it("doesn't fail", function () {
                    const array = '[]';
                    expect(function () {
                        deserialize(array);
                    }).not.toThrow();
                });
            });
            describe('otp types', function () {
                describe('tuples', function () {
                    it('transforms all elements', function () {
                        const encodedTuple =
                            '["$otp.tuple",[["$otp.list",[1,2,3],"$otp.list.nil"],["$otp.tuple",[["$otp.symbol","ok"],{"a":1,"b":2,"c":["$otp.list",["a","b","c"],"$otp.list.nil"]}]],["1","2","3"]]]';
                        const realTuple = t(
                            l(1, 2, 3),
                            t(ok, { a: 1, b: 2, c: l('a', 'b', 'c') }),
                            ['1', '2', '3']
                        );

                        expect(deserialize(encodedTuple)).toMatchPattern(
                            realTuple
                        );
                    });
                });
            });
            describe('objects', function () {
                it("doesn't fail", function () {
                    const object = '{}';
                    expect(function () {
                        deserialize(object);
                    }).not.toThrow();
                });
                it('transforms properties', function () {
                    const encodedObject = `{"a":["$otp.tuple",[["$otp.ref",["$otp.symbol","${Symbol.keyFor(
                        node.name
                    )}"],0,0,1],["$otp.pid",["$otp.symbol","${Symbol.keyFor(
                        node.name
                    )}"],1,0,1]]],"b":["$otp.list",[1,["$otp.tuple",["t","w",["$otp.list", ["a","b","c"],"$otp.list.nil"]]],3,4,5],"$otp.list.nil"],"c":"2"}`;
                    expect(deserialize(encodedObject)).toMatchPattern({
                        a: t(node.ref(), Pid.of(0, 1, 0, 1)),
                        b: l(1, t('t', 'w', l('a', 'b', 'c')), 3, 4, 5),
                        c: '2',
                    });
                });
            });
        });
    });
    describe('with stringify disabled', function () {
        beforeEach(function () {
            const serdes = serializerJson.make(node, { stringify: false });
            serialize = serdes.serialize;
            deserialize = serdes.deserialize;
        });

        describe('and serializing', function () {
            describe('primitves', function () {
                let primitives = [34234, 98.6, 'string', false, null];

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

                describe('of type symbol', function () {
                    describe('with a key', function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(Symbol.for('ok'));
                            }).not.toThrow();
                        });
                        it('can encode', function () {
                            expect(serialize(Symbol.for('ok'))).toMatchPattern([
                                '$otp.symbol',
                                'ok',
                            ]);
                        });
                    });
                    describe('without a key', function () {
                        it("doesn't fail", function () {
                            expect(function () {
                                serialize(Symbol());
                            }).not.toThrow();
                        });
                        it('cannot encode', function () {
                            const symbol = Symbol();
                            expect(serialize(symbol)).toBe(symbol);
                        });
                    });
                });
            });
            describe('otp types', function () {
                describe('tuples', function () {
                    it('transforms all elements', function () {
                        const encodedTuple = [
                            '$otp.tuple',
                            [
                                ['$otp.list', [1, 2, 3], '$otp.list.nil'],
                                [
                                    '$otp.tuple',
                                    [
                                        ['$otp.symbol', 'ok'],
                                        {
                                            a: 1,
                                            b: 2,
                                            c: [
                                                '$otp.list',
                                                ['a', 'b', 'c'],
                                                '$otp.list.nil',
                                            ],
                                        },
                                    ],
                                ],
                                ['1', '2', '3'],
                            ],
                        ];
                        const realTuple = t(
                            l(1, 2, 3),
                            t(ok, { a: 1, b: 2, c: l('a', 'b', 'c') }),
                            ['1', '2', '3']
                        );

                        expect(serialize(realTuple)).toMatchPattern(
                            encodedTuple
                        );
                    });
                });
            });
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
                        b: l(1, 2, t('a', 'b', 'c'), 4, 5),
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
                        b: [
                            '$otp.list',
                            [1, 2, ['$otp.tuple', ['a', 'b', 'c']], 4, 5],
                            '$otp.list.nil',
                        ],
                        c: '2',
                    });
                });
            });
        });
        describe('and deserializing', function () {
            describe('primitves', function () {
                let primitives = [34234, 98.6, 'string', false, null];

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
            describe('otp types', function () {
                describe('tuples', function () {
                    it('transforms all elements', function () {
                        const encodedTuple = [
                            '$otp.tuple',
                            [
                                ['$otp.list', [1, 2, 3], '$otp.list.nil'],
                                [
                                    '$otp.tuple',
                                    [
                                        ['$otp.symbol', 'ok'],
                                        {
                                            a: 1,
                                            b: 2,
                                            c: [
                                                '$otp.list',
                                                ['a', 'b', 'c'],
                                                '$otp.list.nil',
                                            ],
                                        },
                                    ],
                                ],
                                ['1', '2', '3'],
                            ],
                        ];
                        const realTuple = t(
                            l(1, 2, 3),
                            t(ok, { a: 1, b: 2, c: l('a', 'b', 'c') }),
                            ['1', '2', '3']
                        );

                        expect(deserialize(encodedTuple)).toMatchPattern(
                            realTuple
                        );
                    });
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
                            b: [
                                '$otp.list',
                                [
                                    1,
                                    [
                                        '$otp.tuple',
                                        [
                                            't',
                                            'w',
                                            [
                                                '$otp.list',
                                                ['a', 'b', 'c'],
                                                '$otp.list.nil',
                                            ],
                                        ],
                                    ],
                                    3,
                                    4,
                                    5,
                                ],
                                '$otp.list.nil',
                            ],
                            c: '2',
                        })
                    ).toMatchPattern({
                        a: t(node.ref(), Pid.of(0, 1, 0, 1)),
                        b: l(1, t('t', 'w', l('a', 'b', 'c')), 3, 4, 5),
                        c: '2',
                    });
                });
            });
        });
    });
});
