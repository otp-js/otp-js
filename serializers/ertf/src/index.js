import encoder from './encoder';
import parser from './parser';
export function make(node) {
    const encode = encoder(node);
    const parse = parser(node);
    return {
        serialize: encode,
        deserialize: parse,
        encode,
        parse,
    };
}
