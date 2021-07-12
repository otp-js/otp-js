import '../src';

describe('@otpjs/test_utils', function() {
    describe('toMatchPattern', function() {
        it('exists', function() {
            expect(expect(1).toMatchPattern).toBeInstanceOf(Function);
        });
        it('leverages the matching API', function() {
            expect(function() {
                expect(1).toMatchPattern(Number.isFinite)
            }).not.toThrow();
            expect(function() {
                expect(1).toMatchPattern(Number.isNaN)
            }).toThrow();
        })
    });
})
