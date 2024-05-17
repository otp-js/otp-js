import * as NodeSymbols from '@otpjs/node/symbols';
import * as MatchingSymbols from '@otpjs/matching/symbols';

export * from '@otpjs/node';
export * from '@otpjs/matching';
export * from '@otpjs/types';

export const Symbols = { ...NodeSymbols, ...MatchingSymbols };
