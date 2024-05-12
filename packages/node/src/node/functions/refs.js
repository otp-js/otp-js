import { Ref } from '@otpjs/types';
export function install(node) {
    const REF_COUNT = Symbol('REF_COUNT');

    node[REF_COUNT] = 0;
    node.addFunction('ref', function ref() {
        return Ref.for(Ref.LOCAL, node[REF_COUNT]++, 0, 1);
    });
}
