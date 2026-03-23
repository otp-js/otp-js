/* eslint-env jest */
import { describe, it, expect, jest } from '@jest/globals';
import { Node } from '#node';

describe('@otpjs/node', function () {
    describe('addFunction', function () {
        describe('with a unique name', function () {
            it('adds a function', function () {
                const node = new Node();
                node.addFunction('foo', jest.fn());
                expect(() => node.exec('foo', [])).not.toThrow();
            });
        });
        describe('with a duplicate name', function () {
            it('throws an error', function () {
                const node = new Node();
                node.addFunction('foo', jest.fn());
                expect(() => node.addFunction('foo', jest.fn())).toThrow();
            });
        });
    });
    describe('exec', function () {
        describe('with a registered function', function () {
            it('executes the function', function () {
                const node = new Node();
                const impl = jest.fn();
                node.addFunction('foo', impl);
                expect(() => node.exec('foo', [])).not.toThrow();
                expect(impl).toHaveBeenCalled();
            });
            describe('with arguments', function () {
                it('executes the function', function () {
                    const node = new Node();
                    const impl = jest.fn();
                    node.addFunction('foo', impl);
                    expect(() => node.exec('foo', [1, 2, 3])).not.toThrow();
                    expect(impl).toHaveBeenCalledWith(1, 2, 3);
                });
            });
            describe('with no arguments', function () {
                it('executes the function', function () {
                    const node = new Node();
                    const impl = jest.fn();
                    node.addFunction('foo', impl);
                    expect(() => node.exec('foo')).not.toThrow();
                    expect(impl).toHaveBeenCalledWith();
                });
            });
        });
        describe('with an unregistered function', function () {
            it('throws an error', function () {
                const node = new Node();
                expect(() => node.exec('foo', [])).toThrow();
            });
        });
    });
});
