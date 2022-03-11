import { Pid, Ref, l, t } from '../src';

jest.disableAutomock();

describe('Pid', function () {
    it('cannot identify Pids from strings', function () {
        expect(Pid.isPid('Pid<0.0>')).toBe(false);
    });
    it('can identify Pids from Pids', function () {
        expect(Pid.isPid(Pid.of(0, 0))).toBe(true);
    });
});
describe('Ref', function () {
    it('cannot identify Refs from strings', function () {
        expect(Ref.isRef('Ref<0.0>')).toBe(false);
    });
    it('can identify Refs from Refs', function () {
        expect(Ref.isRef(Ref.for(0, 0))).toBe(true);
    });
});
describe('Tuple', function () {
    it('accepts an arbitrary number of elements', function () {
        const tuple1 = t(1, 2, 3);
        expect(tuple1.size).toBe(3);

        const tuple2 = t(...new Array(100));
        expect(tuple2.size).toBe(100);
    });
});

describe('List', function () {
    it('accepts an arbitrary number of elements', function () {
        const list1 = l(1, 2, 3);
        expect(list1.length()).toBe(3);

        const list2 = l(...new Array(100));
        expect(list2.length()).toBe(100);
    });
});
