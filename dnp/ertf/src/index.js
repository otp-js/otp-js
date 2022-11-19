import encoder from './encoder';
import parser from './parser';
export function make(node, options) {
    const encode = encoder(node, options);
    const parse = parser(node, options);
    return {
        serialize: encode,
        deserialize: parse,
        encode,
        parse,
    };
}
