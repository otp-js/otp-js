import '../src';

describe('@otpjs/test_utils', function () {
    describe('toHaveBeenNthCalledWithPattern', function () {
        it('matches against the arguments of a specific call', function () {
            const fn = jest.fn(() => true);

            fn('a', 1, NaN);
            fn(NaN, 'b', 2);
            fn([1, 2, 3], 3, 'c');

            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(
                    0,
                    'a',
                    Number.isInteger,
                    Number.isNaN
                );
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(
                    0,
                    Array.isArray,
                    Number.isInteger,
                    'c'
                );
            }).toThrow();

            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(
                    1,
                    Number.isNaN,
                    'b',
                    Number.isInteger
                );
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(1, 'a', Number.isNaN);
            }).toThrow();

            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(
                    2,
                    Number.isNaN,
                    'b',
                    Number.isInteger
                );
            }).toThrow();
            expect(function () {
                expect(fn).toHaveBeenNthCalledWithPattern(
                    2,
                    Array.isArray,
                    Number.isInteger,
                    'c'
                );
            }).not.toThrow();
        });
    });
    describe('toHaveBeenLastCalledWithPattern', function () {
        it('matches against the arguments of the latest call', function () {
            const fn = jest.fn(() => true);

            fn(1, 2, 3);
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern(
                    Number.isInteger,
                    Number.isInteger,
                    Number.isInteger
                );
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern(1, 2, 3);
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern('a', 'b', 'c');
            }).toThrow();

            fn('a', 'b', 'c');
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern(
                    Number.isInteger,
                    Number.isInteger,
                    Number.isInteger
                );
            }).toThrow();
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern(1, 2, 3);
            }).toThrow();
            expect(function () {
                expect(fn).toHaveBeenLastCalledWithPattern('a', 'b', 'c');
            }).not.toThrow();
        });
    });
    describe('toHaveBeenCalledWithPattern', function () {
        it('matches against the arguments of the any call', function () {
            const fn = jest.fn(() => true);

            fn(1, 2, 3);
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern(
                    Number.isInteger,
                    Number.isInteger,
                    Number.isInteger
                );
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern(1, 2, 3);
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern('a', 'b', 'c');
            }).toThrow();

            fn('a', 'b', 'c');
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern(
                    Number.isInteger,
                    Number.isInteger,
                    Number.isInteger
                );
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern(1, 2, 3);
            }).not.toThrow();
            expect(function () {
                expect(fn).toHaveBeenCalledWithPattern('a', 'b', 'c');
            }).not.toThrow();
        });
    });
    describe('toMatchPattern', function () {
        it('exists', function () {
            expect(expect(1).toMatchPattern).toBeInstanceOf(Function);
        });
        it('leverages the matching API', function () {
            expect(function () {
                expect(1).toMatchPattern(Number.isFinite);
            }).not.toThrow();
            expect(function () {
                expect(1).toMatchPattern(Number.isNaN);
            }).toThrow();
        });
    });
});
