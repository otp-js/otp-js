import * as matching from './lib/index.js';

const { _ } = matching.Symbols;

export function getOTPThrown(err) {
    const hasTerm =
        err !== null && err !== undefined && typeof err.term !== 'undefined';

    if (
        hasTerm &&
        typeof err.name === 'string' &&
        typeof err.stack === 'string'
    ) {
        return { hasTerm, isError: true, term: err.term, value: err };
    } else {
        return {
            hasTerm,
            isError: false,
            term: hasTerm ? err.term : null,
            value: err,
        };
    }
}

export function isOTPError(err) {
    return err instanceof Error && err.term !== undefined;
}


function getBasePromise(assertion) {
    if (typeof assertion.then === 'function') return assertion;
    else return assertion._obj;
}

/**
 * @type Chai.ChaiPlugin
 */
export default function testUtils(_chai, utils) {
    _chai.Assertion.addMethod('matchPattern', function(pattern) {
        const obj = this._obj;
        const matches = matching.compile(pattern);

        this.assert(
            matches(obj),
            'expected #{this} to match #{exp}',
            'expected #{this} not to match #{exp}',
            pattern,
            obj
        );
    })

    function transferPromiseness(assertion, promise) {
        assertion.then = promise.then.bind(promise);
    }

    _chai.Assertion.addMethod('rejectedWithTerm', function(pattern = _) {
        const obj = this._obj;
        const matches = matching.compile(pattern);
        const negate = utils.flag(this, 'negate') || false;

        const nextPromise = getBasePromise(this).then(
            value => {
                this.assert(
                    false,
                    'expected promise to be rejected with the term #{exp} but it was fulfilled with #{act}',
                    null,
                    pattern,
                    value
                )
            },
            reason => {
                if (negate) {
                    const { term } = getOTPThrown(reason);
                    this.assert(
                        matches(term),
                        null,
                        'expected promise not to be rejected with a term matching #{exp}, but it was rejected with #{act}',
                        pattern,
                        term
                    );
                } else if (isOTPError(reason)) {
                    const { term } = getOTPThrown(reason);
                    this.assert(
                        matches(term),
                        'expected promise to be rejected with a term matching #{exp}, but got #{act}',
                        'expected promise not to be rejected with a term matching #{exp}, but got #{act}',
                        pattern,
                        term
                    )
                } else {
                    this.assert(
                        matches(reason),
                        'expected promise to be rejected with a term matching #{exp}, but got #{act}',
                        'expected promise not to be rejected with a term matching #{exp}, but got #{act}',
                        pattern,
                        reason
                    )
                }
            }
        )

        transferPromiseness(this, nextPromise);
    })

    _chai.Assertion.addMethod('throwTerm', function(pattern) {
        const obj = this._obj;
        const matches = matching.compile(pattern);

        let errorWasThrown = false;
        let thrownValue = undefined;
        let result = undefined;
        try {
            result = obj();
        } catch (err) {
            thrownValue = err;
            errorWasThrown = true;
        }

        this.assert(
            errorWasThrown,
            'expected #{this} to throw a term, but succeeded with #{act}',
            'expected #{this} not to throw a term, and succeeded with #{act}',
            pattern,
            result
        );

        this.assert(
            isOTPError(thrownValue),
            'expected #{this} to throw a term, but got #{act}',
            'expected #{this} not to throw a term, but got #{act}'
        )

        let matchingSuffix;
        if (pattern) {
            matchingSuffix = 'matching #{exp}';
        } else {
            pattern = _;
            matchingSuffix = '';
        }

        const { term } = getOTPThrown(thrownValue);

        this.assert(
            matches(term),
            `expected #{this} to throw a term matching #{exp}, but got #{act}`,
            `expected #{this} not to throw a term matching #{exp}, but got #{act}`,
            pattern,
            term
        )
    })

    function isSpy(maybeSpy) {
        return (
            typeof maybeSpy === 'function' &&
            typeof maybeSpy.getCalls === 'function' &&
            typeof maybeSpy.calledWithExactly === 'function'
        );
    }

    _chai.Assertion.addMethod('calledWithPattern', function(...pattern) {
        let obj = this._obj;
        let matches = matching.compile(pattern);

        if (!isSpy(obj)) {
            throw new TypeError(`${utils.inspect(obj)} is not a spy`);
        }

        const calls = obj.getCalls();
        let foundMatch = false;
        let index = 0;
        while (index < calls.length && !foundMatch) {
            const call = calls[index];
            foundMatch = matches(call.args);
            index++;
        }

        this.assert(
            foundMatch,
            'expected #{this} to have been called with arguments matching #{exp}',
            'expected #{this} not to have been called with arguments matching #{exp}',
            pattern
        )
    })
}
