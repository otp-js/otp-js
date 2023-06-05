import * as core from '../src';
import { t, l, Pid, OTPError } from '@otpjs/types';
import * as matching from '@otpjs/matching';
import '@otpjs/test_utils';

function log(ctx, ...args) {
    return ctx.log.extend('core:__tests__')(...args);
}

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const {
    ok,
    nodedown,
    normal,
    error,
    DOWN,
    kill,
    killed,
    badarg,
    EXIT,
    trap_exit,
} = core.Symbols;
const { spread, _ } = matching.Symbols;
const test = Symbol.for('test');
const test_b = Symbol.for('test_b');

describe('@otpjs/core.Context', () => {
    let node;
    let ctxA;
    let ctxB;

    beforeEach(function () {
        node = new core.Node();
        ctxA = node.makeContext();
        ctxB = node.makeContext();
    });

    describe('receive', function () {
        describe('with no arguments', function () {
            it('awaits indefinitely', function () {});
        });
    });
    describe('helpers', function () {
        it('points env to node', function () {
            expect(ctxA.env).toBe(node);
            expect(ctxB.env).toBe(node);
        });
        it('exposes a log function', function () {
            expect(ctxA.log).toBeInstanceOf(Function);
            expect(ctxB.log).toBeInstanceOf(Function);
        });
        describe('die', function () {
            it('ends the context', async function () {
                expect(function () {
                    return ctxA.die(normal);
                }).not.toThrow();
                await wait(50);
                expect(ctxA._processInfo()).toBeUndefined();
                await expect(ctxA.death).resolves.toBe(normal);
            });
            it('does not unwrap errors', async function () {
                ctxA.die(OTPError(badarg));
                await wait(50);
                expect(ctxA._processInfo()).toBeUndefined();
                await expect(ctxA.death).resolves.toBeInstanceOf(OTPError);
                const error = await ctxA.death;
                expect(error.term).toBe(badarg);
            });
        });
        describe('processFlag', function () {
            describe('called with just the flag', function () {
                it('rejects unknown flags', function () {
                    const imaginaryFlag = Symbol();
                    log(
                        ctxB,
                        'processFlag.rejectsUnknownFlags(imaginaryFlag: %o)',
                        imaginaryFlag
                    );
                    expect(
                        ctxA.processFlag.bind(ctxA, imaginaryFlag)
                    ).toThrowTerm(t('unknown_flag', imaginaryFlag));
                });
                it('returns the current value of the flag', function () {
                    expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                });
            });
            describe('called with a flag and a value', function () {
                it('rejects unknown flags', function () {
                    const imaginaryFlag = Symbol();
                    expect(
                        ctxA.processFlag.bind(ctxA, imaginaryFlag, true)
                    ).toThrowTerm(t('unknown_flag', imaginaryFlag));
                });
                it('updates the value of the flag', function () {
                    expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                    expect(ctxA.processFlag(trap_exit, true)).toBe(true);
                    expect(ctxA.processFlag(trap_exit)).toBe(true);
                });
            });
            describe('trap_exit', function () {
                it('is disabled by default', function () {
                    expect(ctxA.processFlag(trap_exit)).toBeFalsy();
                });
                describe('when enabled', function () {
                    it('captures exit signals', async function () {
                        ctxA.processFlag(trap_exit, true);
                        ctxA.link(ctxB.self());
                        ctxA.exit(ctxB.self(), kill);

                        await expect(ctxA.receive()).resolves.toMatchPattern(
                            t(EXIT, _, _)
                        );
                    });
                });
                describe('when disabled', function () {
                    it('exits after receiving an exit signal', async function () {
                        ctxA.link(ctxB.self());
                        ctxA.exit(ctxB.self(), kill);

                        await wait(50);

                        expect(ctxB.dead).toBe(true);
                        expect(ctxA.dead).toBe(true);
                        await expect(ctxA.death).resolves.toBe(killed);
                    });
                });
            });
        });
    });

    describe('when linked', function () {
        it('can unlink if it created the link', function () {
            ctxA.link(ctxB.self());
            expect(function () {
                ctxA.unlink(ctxB.self());
            }).not.toThrow();
            expect(ctxA.processInfo(ctxA.self())).toMatchPattern({
                links: [],
                [spread]: _,
            });
        });
    });
});
