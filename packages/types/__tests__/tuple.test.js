/* eslint-env mocha */
import * as chai from 'chai';
import crypto from 'crypto';
import * as sinon from 'sinon';
import util from 'util';
import { t } from '../lib/index.js';

const inspect = Symbol.for('nodejs.util.inspect.custom');

const { expect } = chai;

afterEach(function () {
    sinon.restore();
});

describe('Tuple', function () {
    describe('isTuple', function () {
        it('returns true if the object is a tuple', function () {
            expect(t.isTuple(t(1, 2, 3))).to.equal(true);
        });
        it('returns false if the object is not a tuple', function () {
            expect(t.isTuple([])).to.equal(false);
            expect(t.isTuple({})).to.equal(false);
            expect(t.isTuple('')).to.equal(false);
            expect(t.isTuple(0)).to.equal(false);
            expect(t.isTuple(0n)).to.equal(false);
            expect(t.isTuple(false)).to.equal(false);
        });
    });
    describe('create', function () {
        it('creates an empty tuple of the given size', function () {
            expect(t.create(0).size).to.equal(0);
            expect(t.create(1).size).to.equal(1);
            expect(t.create(2).size).to.equal(2);
        });
    });
    it('accepts an arbitrary number of items', function () {
        const tuple1 = t(1, 2, 3);
        expect(tuple1.size).to.equal(3);

        const tuple2 = t(...new Array(100));
        expect(tuple2.size).to.equal(100);
    });
    it('is iterable', function () {
        const tuple = t(1, 2, 3);
        expect(tuple[Symbol.iterator]).not.to.equal(undefined);
        expect(function () {
            for (const value of tuple) {
                expect(value).to.be.a('number');
            }
        }).not.to.throw();
    });
    it('allows read access via get method', function () {
        const buffer = crypto.randomBytes(Math.floor(Math.random() * 128) + 1);
        const tuple1 = t(...buffer);

        for (let index = 0; index < buffer.length; index++) {
            const value = buffer.readUInt8(index);
            expect(tuple1.get(index)).to.equal(value);
        }

        expect(() => tuple1.get(buffer.length + 1)).to.throw(RangeError);
    });
    it('allows read access via numeric index', function () {
        const buffer = crypto.randomBytes(Math.floor(Math.random() * 128) + 1);
        const tuple1 = t(...buffer);

        for (let index = 0; index < buffer.length; index++) {
            const value = buffer.readUInt8(index);
            expect(tuple1[index]).to.equal(value);
        }

        expect(() => tuple1[buffer.length + 1]).to.throw(RangeError);
    });
    it('allows reading of defined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);

        expect(() => tuple1.get).not.to.throw();
        expect(() => tuple1.set).not.to.throw();
        expect(() => tuple1.size).not.to.throw();
        expect(() => tuple1.toJSON).not.to.throw();
        expect(() => tuple1[inspect]).not.to.throw();
        expect(() => tuple1[Symbol.iterator]).not.to.throw();
    });
    it('allows reading of undefined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);
        expect(tuple1.newProperty).to.equal(undefined);
        expect(tuple1[Symbol()]).to.equal(undefined);
    });
    it('does not allow writing to defined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);

        expect(() => (tuple1.get = undefined)).to.throw(RangeError);
        expect(() => (tuple1.set = undefined)).to.throw(RangeError);
        expect(() => (tuple1.size = undefined)).to.throw(RangeError);
        expect(() => (tuple1.toJSON = undefined)).to.throw(RangeError);
        expect(() => (tuple1[inspect] = undefined)).to.throw(RangeError);
        expect(() => (tuple1[Symbol.iterator] = undefined)).to.throw(
            RangeError
        );
    });
    it('does not allow writing to undefined string and symbol properties', function () {
        const tuple1 = t(1, 2, 3);
        expect(() => (tuple1.newProperty = null)).to.throw(RangeError);
        expect(() => (tuple1[Symbol()] = null)).to.throw(RangeError);
    });
    it('allows write access via set method', function () {
        const size = Math.floor(Math.random() * 128) + 1;
        const tuple1 = t(...String.fromCharCode(0).repeat(size));

        for (let index = 0; index < size; index++) {
            const value = Math.floor(Math.random() * 128);
            expect(tuple1.get(index)).to.equal('\x00');
            expect(() => tuple1.set(index, value)).not.to.throw();
            expect(tuple1.get(index)).to.equal(value);
        }

        expect(() => tuple1.set(size + 1, 'any value')).to.throw(RangeError);
    });
    it('allows write access via numeric index', function () {
        const size = Math.floor(Math.random() * 128) + 1;
        const tuple1 = t(...String.fromCharCode(0).repeat(size));

        for (let index = 0; index < size; index++) {
            const value = Math.floor(Math.random() * 128);
            expect(tuple1[index]).to.equal('\x00');
            expect(() => (tuple1[index] = value)).not.to.throw();
            expect(tuple1[index]).to.equal(value);
        }

        expect(() => (tuple1[size + 1] = 'any value')).to.throw(RangeError);
    });
    describe('inspection', function () {
        it('implements a custom inspect function', function () {
            const tuple = t(1, 2, 3);
            expect(tuple[inspect]).not.to.equal(undefined);
            expect(tuple[inspect]).to.be.an.instanceOf(Function);
        });

        it('returns a string', function () {
            const tuple = t(1, 2, 3);
            expect(function () {
                util.inspect(tuple);
            }).not.to.throw();
        });

        it('returns a shortened form if depth is consumed', function () {
            expect(util.inspect(t(1, 2, 3), { depth: -1 })).to.equal('[Tuple]');
        });

        it('returns a shortened form if size is greater than maxArrayLength', function () {
            expect(util.inspect(t(1, 2, 3), { maxArrayLength: 0 })).to.equal(
                '{ ... 3 more items }'
            );
        });

        it('handles null depth', function () {
            expect(util.inspect(t(1, 2, 3), { depth: null })).to.equal(
                '{ 1, 2, 3 }'
            );
        });
    });
    describe('toJSON', function () {
        it('encodes as an array with tag and array of items', function () {
            expect(t(1, 2, 3).toJSON()).to.deep.equal([
                '$otp.tuple',
                [1, 2, 3],
            ]);
        });
    });
    describe('toString', function () {
        describe('when depth is 0', function () {
            it('returns an empty tuple string', function () {
                expect(t().toString()).to.equal('{ }');
            });
        });
        describe('when the length is 1 or more', function () {
            it('returns a tuple string containing the stringified item', function () {
                expect(t('foo').toString()).to.equal('{ foo }');
                expect(t(1).toString()).to.equal('{ 1 }');
            });
            it('uses the toString method of its items', function () {
                const toString = sinon.spy(() => 'foo');
                const object = { toString };
                const tuple = t(1, object);

                expect(tuple.toString()).to.equal('{ 1, foo }');
                expect(toString).to.have.callCount(1);
            });
        });
        describe('given a symbol child', function () {
            describe('of a well-known symbol', function () {
                it('returns the well-known symbol', function () {
                    const symbol = Symbol.for('foo');
                    expect(t(symbol).toString()).to.equal('{ Symbol(foo) }');
                });
            });
            describe('of a tagged symbol', function () {
                it('returns the tagged symbol', function () {
                    const symbol = Symbol('foo');
                    expect(t(symbol).toString()).to.equal('{ Symbol(foo) }');
                });
            });
            describe('of an anonymous symbol', function () {
                it('returns the anonymous symbol', function () {
                    // eslint-disable-next-line symbol-description
                    const symbol = Symbol();
                    expect(t(symbol).toString()).to.equal('{ Symbol() }');
                });
            });
        });
    });
});
