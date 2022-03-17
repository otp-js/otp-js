import { Pid, Ref, Tuple, List } from './lib';

if (window.devtoolsFormatters === undefined) {
    window.devtoolsFormatters = [];
}

window.devtoolsFormatters.push({
    header: (obj) => {
        if (Ref.isRef(obj)) {
            return ['div', { style: 'color: darkgoldenrod;' }, obj.toString()];
        }
    },
    hasBody: () => false,
});
window.devtoolsFormatters.push({
    header: (obj) => {
        if (!(obj instanceof Tuple)) return null;
        return [
            'span',
            {},
            `{ `,
            ...Array.from(obj).reduce(
                (acc, object) => [
                    ...acc,
                    ...(acc.length > 0 ? [', '] : []),
                    ['object', { object }],
                ],
                []
            ),
            ` }`,
        ];
    },
    hasBody: () => false,
});
window.devtoolsFormatters.push({
    header: (obj) => {
        if (Pid.isPid(obj)) {
            return ['div', { style: 'color: teal;' }, obj.toString()];
        }
    },
    hasBody: () => false,
});
window.devtoolsFormatters.push({
    header: (obj) => {
        if (!List.isList(obj)) return null;
        return [
            'span',
            {},
            `[`,
            ...Array.from(obj).reduce(
                (acc, object) => [
                    ...acc,
                    ...(acc.length > 0 ? [', '] : [' ']),
                    ['object', { object }],
                ],
                []
            ),
            ` ]`,
        ];
    },
    hasBody: () => false,
});
