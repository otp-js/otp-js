/* eslint-env jest */
import * as core from '../src';
import * as matching from '@otpjs/matching';
import { t } from '@otpjs/types';
import '@otpjs/test_utils';
import { already_receiving } from '../src/symbols';

const { ok, timeout } = core.Symbols;
const { _, spread } = matching.Symbols;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@otpjs/core.MessageBox', function () {
    it('is a type of array', function () {
        const mb = new core.MessageBox();
        expect(Array.isArray(mb)).toBe(true);
    });

    describe('after pushing', function () {
        describe('when there is no predicate pending', function () {
            it('increases its length by 1', function () {
                const mb = new core.MessageBox();
                expect(mb.length).toBe(0);

                for (let i = 0; i < 10; i++) {
                    expect(mb.length).toBe(i);
                    mb.push('test');
                    expect(mb.length).toBe(i + 1);
                }
            });
        });
        describe('when there is a predicate pending', function () {
            describe('which matches the message', function () {
                it('should have no contents', async function () {
                    const mb = new core.MessageBox();
                    expect(mb.pending).toBe(0);
                    expect(mb.length).toBe(0);

                    const promiseA = mb.pop();
                    expect(mb.isReceiving).toBe(true);

                    mb.push('test');

                    expect(mb.length).toBe(0);
                    expect(mb.isReceiving).toBe(false);

                    await expect(promiseA).resolves.toMatchPattern(
                        t(ok, 'test')
                    );
                });
            });
            describe('which does not match the message', function () {
                it('increases its length by 1', function () {
                    const mb = new core.MessageBox();
                    mb.pop(() => false);
                    expect(mb.length).toBe(0);

                    for (let i = 0; i < 10; i++) {
                        expect(mb.length).toBe(i);
                        mb.push('test');
                        expect(mb.length).toBe(i + 1);
                    }
                });
            });
        });
    });
    describe('pop', function () {
        describe('when already receiving', function () {
            it('throws an error', async function () {
                const mb = new core.MessageBox();
                mb.pop();

                await expect(() => mb.pop()).rejects.toThrowTerm(
                    already_receiving
                );
            });
        });
        describe('with a timeout', function () {
            describe('with no predicate', function () {
                describe('when there are available messages', function () {
                    it('takes messages in the order they were inserted', async function () {
                        const mb = new core.MessageBox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');

                        expect(await mb.pop(100)).toMatchPattern(t(ok, 'test'));
                        expect(await mb.pop(100)).toMatchPattern(
                            t(ok, 'test2')
                        );
                        expect(await mb.pop(100)).toMatchPattern(
                            t(ok, 'test3')
                        );
                    });
                    it('only takes messages that match the specified pattern', async function () {
                        const mb = new core.MessageBox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');

                        const match = (predicate) =>
                            (message) => predicate(message)
                                ? Promise.resolve(t(ok, message))
                                : false;

                        await expect(
                            mb.pop(match(matching.compile('test2')), 100)
                        ).resolves.toMatchPattern(t(ok, 'test2'));
                        await expect(
                            mb.pop(match(matching.compile('test3')), 100)
                        ).resolves.toMatchPattern(t(ok, 'test3'));
                        await expect(
                            mb.pop(match(matching.compile('test')), 100)
                        ).resolves.toMatchPattern(t(ok, 'test'));
                    });
                });
                describe('when there are no available messages', function () {
                    it('throws a timeout error if its timer expires', async function () {
                        const mb = new core.MessageBox();
                        await expect(mb.pop(100)).rejects.toThrowTerm(timeout);
                    });
                });
            });
            describe('with a predicate', function () {
                it('will not throw given an incompatible message', async function () {
                    const mb = new core.MessageBox();
                    mb.push({ iam: 'not_iterable' });
                    const promise = mb.pop(() => {
                        throw Error('badarg');
                    }, 100);
                    mb.push({ iam: 'not_iterable' });
                    await expect(promise).rejects.toThrowTerm(timeout);
                });
                describe('when there are available messages', function () {
                    it('returns the first matching message', async function () {
                        const mb = new core.MessageBox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                        await expect(
                            mb.pop((message) => message === 'test2' ? Promise.resolve(t(ok, message)) : false, 100)
                        ).resolves.toMatchPattern(t(ok, 'test2'));
                        expect(mb.length).toBe(2);
                    });

                    it('will wait if none of the messages match', async function () {
                        const mb = new core.MessageBox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                        const request = mb.pop((m) => m === 'test4', 100);
                        const expectation =
                            expect(request).rejects.toThrowTerm(timeout);
                        expect(mb.isReceiving).toBe(true);
                        await expectation;
                        expect(mb.isReceiving).toBe(false);
                    });
                });
                describe('when there are no available messages', function () {
                    it('times out if no message is received', async function () {
                        const mb = new core.MessageBox();
                        const request = mb.pop((m) => m === 'test', 100);
                        const expectation =
                            expect(request).rejects.toThrowTerm(timeout);
                        expect(mb.isReceiving).toBe(true);
                        await expectation;
                        expect(mb.isReceiving).toBe(false);
                    });
                    it('does not time out if a matching message is received', async function () {
                        const mb = new core.MessageBox();
                        const request = mb.pop((m) => m === 'test'
                            ? Promise.resolve(t(ok, m))
                            : false, 100);
                        const expectation = expect(
                            request
                        ).resolves.toMatchPattern(t(ok, 'test'));
                        expect(mb.isReceiving).toBe(true);

                        mb.push('test');
                        await expectation;
                        expect(mb.isReceiving).toBe(false);

                        await wait(150);
                    });
                });
            });
        });
        describe('without a timeout', function () {
            describe('with no predicate', function () {
                it('returns the first message available', async function () {
                    const mb = new core.MessageBox();
                    mb.push('first');
                    mb.push('second');
                    mb.push('third');
                    await expect(mb.pop()).resolves.toMatchPattern(
                        t(ok, 'first')
                    );
                    await expect(mb.pop()).resolves.toMatchPattern(
                        t(ok, 'second')
                    );
                    await expect(mb.pop()).resolves.toMatchPattern(
                        t(ok, 'third')
                    );
                });
            });
            describe('with a predicate', function () {});
        });
    });
    describe('clear', function () {
        describe('when there are pending messages', function () {
            it('discards the messages', function () {
                const mb = new core.MessageBox();
                mb.push('test1');
                mb.push('test2');
                mb.push('test3');
                expect(mb.length).toBe(3);
                expect(() => mb.clear()).not.toThrow();
                expect(mb.length).toBe(0);
            });
        });

        describe('when there is a pending resolvers', function () {
            it('rejects the receiver', async function () {
                const mb = new core.MessageBox();
                const promise = mb.pop();
                expect(mb.isReceiving).toBe(true);
                expect(() => mb.clear('reason')).not.toThrow();
                expect(mb.isReceiving).toBe(false);
                await expect(promise).rejects.toBe('reason');
            });
        });
    });
});
