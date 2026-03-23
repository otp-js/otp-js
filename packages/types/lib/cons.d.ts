const _mark: unique symbol = Symbol();

type Selector<H, T> = (head: H, tail: T) => H | T;
interface List {
    (select: Selector<unknown, unknown>): unknown;
    [Symbol.species]: nil | typeof cons
}
interface nil extends List {
    (select: Selector<unknown, unknown>): nil;
    [Symbol.species]: nil
}
interface Cell<H, T> extends List, HKT {
    <Select extends Selector<unknown, unknown>>(
        select: Select
    ): Select extends (head: H, tail: T) => infer Selected ? Selected : never;
    [_mark]: true;
    [Symbol.species]: typeof cons
    readonly type: H;
}
export const nil: nil;

export function cons<const H, const T>(head: H, tail: T): Cell<H, T>;

type HeadFrom<C extends List> = C extends Cell<infer H, infer _T>
    ? H
    : C extends nil
    ? nil
    : never;
export function car<C extends List>(cell: C): HeadFrom<C>;
type TailFrom<C extends List> = C extends Cell<infer _H, infer T>
    ? T
    : C extends nil
    ? nil
    : never;
export function cdr<C extends List>(cell: C): TailFrom<C>;

type Debounce<C> = C extends { __recurse: infer Bounce }
    ? Debounce<Bounce>
    : C extends Cell<infer H, infer T>
    ? Cell<H, Debounce<T>>
    : C extends nil
    ? nil
    : ['debounce fail', C];
type _ListFrom<Elements extends unknown[]> = Elements extends [
    infer H,
    ...infer T
]
    ? Cell<H, { __recurse: ListFrom<T> }>
    : Elements extends []
    ? nil
    : never;
type ListFrom<Elements extends unknown[]> = Debounce<_ListFrom<Elements>>;

export function from<const A extends unknown[]>(
    ...args: [...A]
): ListFrom<typeof args>;

type IsList<V> = V extends List ? true : V extends List ? true : V;
type IsEmpty<V> = V extends List ? false : V extends nil ? true : never;
export function isCons<const V>(value: V): IsList<V>;

type _Reversed<C extends List, Stack extends List = nil> = C extends nil
    ? Stack
    : C extends Cell<
        infer H,
        infer T extends List
    >
    ? { __recurse: _Reversed<T, Cell<H, Stack>> }
    : never;
type Reversed<C extends List> = Debounce<_Reversed<C>>;
export function reverse<C extends List>(cell: C): Reversed<C>;

type GenericFunction = (...args: any[]) => any;

export interface HKT<I = unknown, O = unknown, T = unknown> {
    [HKT.isHKT]: never;
    [HKT.input]: I;
    [HKT.output]: O;
    [HKT.tail]: T;
}
export declare namespace HKT {
    const isHKT: unique symbol;
    const input: unique symbol;
    const output: unique symbol;
    const tail: unique symbol;

    type Input<T extends HKT<any, any, any>> = T[typeof HKT.input];
    type Output<T extends HKT<any, any, any>, I extends Input<T>> = (T & { [input]: I })[typeof output];
    type Tail<T extends HKT<any, any, any>> = T[typeof HKT.tail];

    interface Compose<O, A extends HKT<any, O>, B extends HKT<any, Input<A>>> extends HKT<Input<B>, O> {
        [output]: Output<A, Output<B, Input<this>>>
    }

    interface Constant<H, T, I = unknown> extends HKT<H, I, T> {}
}



type _MapKind<C extends List, Transform extends HKT<any, any>> = C extends Cell<infer Head, infer Tail> ? (Transform & { [HKT.input]: Head })[HKT.output];
type Transform<A, B> = (arg: A) => B;
type Mapped<
    C extends List,
    A, B,
    F extends HKT
> = Debounce<_MapKind<C, F, A, B>>;
