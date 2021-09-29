import { Pid, Ref } from '../src/types';

describe('Pid', function() {
    it('cannot identify Pids from strings', function() {
        expect(Pid.isPid("Pid<0.0>")).toBe(false);
    });
    it('can identify Pids from Pids', function() {
        expect(Pid.isPid(Pid.of(0, 0))).toBe(true);
    });
})
describe('Ref', function() {
    it('cannot identify Refs from strings', function() {
        expect(Ref.isRef("Ref<0.0>")).toBe(false);
    });
    it('can identify Refs from Refs', function() {
        expect(Ref.isRef(Ref.for(0, 0))).toBe(true);
    });
})
