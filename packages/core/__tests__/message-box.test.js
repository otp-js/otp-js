import './extend';
import * as core from '../src';

const { ok, _ } = core.Symbols;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@otpjs/core.MessageBox', function () {
    let mb = null;
    beforeEach(function () {
        mb = new core.MessageBox();
    });

    it('is a type of array', function () {
        expect(Array.isArray(mb)).toBe(true);
    });

    describe('after pushing', function () {
        describe('when there are no pending resolvers', function () {
            it('increases its length by 1', function () {
                const length = mb.length;
                expect(mb.length).toBe(0);

                for (let i = 0; i < 10; i++) {
                    expect(mb.length).toBe(i);
                    mb.push('test');
                    expect(mb.length).toBe(i + 1);
                }
            });
        });
        describe('when there are pending resolvers', function () {
            it('should have no contents', async function () {
                expect(mb.pending).toBe(0);
                expect(mb.length).toBe(0);

                mb.push('test');
                expect(mb.length).toBe(1);
                expect(mb.pending).toBe(0);

                await mb.pop();
                expect(mb.length).toBe(0);
                expect(mb.pending).toBe(0);

                mb.pop();
                await new Promise((resolve) => setTimeout(resolve, 10));
                expect(mb.length).toBe(0);
                expect(mb.pending).toBe(1);

                mb.push('test');
                await new Promise((resolve) => setTimeout(resolve, 10));
                expect(mb.length).toBe(0);
                expect(mb.pending).toBe(0);
            });

            it('increases its pending by 1', function () {
                expect(mb.pending).toBe(0);
                for (let i = 0; i < 10; i++) {
                    expect(mb.pending).toBe(i);
                    mb.pop();
                    expect(mb.pending).toBe(i + 1);
                }
            });
        });
    });
    describe('pop', function () {
        describe('with a timeout', function () {
            describe('with no predicate', function () {
                describe('when there are available messages', function () {
                    beforeEach(function () {
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                    });
                    afterEach(function () {
                        mb.clear();
                    });
                    it('takes messages in the order they were inserted', async function () {
                        expect(await mb.pop(100)).toMatchPattern([
                            ok,
                            'test',
                            _,
                        ]);
                        expect(await mb.pop(100)).toMatchPattern([
                            ok,
                            'test2',
                            _,
                        ]);
                        expect(await mb.pop(100)).toMatchPattern([
                            ok,
                            'test3',
                            _,
                        ]);
                    });
                    it('only takes messages that match the specified pattern', async function () {
                        await expect(
                            mb.pop(core.compile('test2'), 100)
                        ).resolves.toMatchPattern([ok, 'test2', _]);
                        await expect(
                            mb.pop(core.compile('test3'), 100)
                        ).resolves.toMatchPattern([ok, 'test3', _]);
                        await expect(
                            mb.pop(core.compile('test'), 100)
                        ).resolves.toMatchPattern([ok, 'test', _]);
                    });
                });
                describe('when there are no available messages', function () {
                    it('throws a timeout error if its timer expires', async function () {
                        await expect(mb.pop(100)).rejects.toThrow('timeout');
                    });
                });
            });
            describe('with a predicate', function () {
                it('will not throw given an incompatible message', async function () {
                    mb.push({ iam: 'not_iterable' });
                    let promise = mb.pop(() => {
                        throw Error('badarg');
                    }, 100);
                    mb.push({ iam: 'not_iterable' });
                    await expect(promise).rejects.toThrow('timeout');
                });
                describe('when there are available messages', function () {
                    beforeEach(function () {
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                    });

                    it('returns the first matching message', async function () {
                        await expect(
                            mb.pop((message) => message === 'test2', 100)
                        ).resolves.toMatchPattern([ok, 'test2', _]);
                        expect(mb.length).toBe(2);
                    });

                    it('will wait if none of the messages match', async function () {
                        let request = mb.pop((m) => m === 'test4', 100);
                        let expectation =
                            expect(request).rejects.toThrow('timeout');
                        expect(mb.pending).toBe(1);
                        await expectation;
                        expect(mb.pending).toBe(0);
                    });
                });
                describe('when there are no available messages', function () {
                    it('times out if no message is received', async function () {
                        let request = mb.pop((m) => m === 'test', 100);
                        let expectation =
                            expect(request).rejects.toThrow('timeout');
                        expect(mb.pending).toBe(1);
                        await expectation;
                        expect(mb.pending).toBe(0);
                    });
                    it('does not time out if a matching message is received', async function () {
                        let request = mb.pop((m) => m === 'test', 100);
                        let expectation = expect(
                            request
                        ).resolves.toMatchPattern([ok, 'test', _]);
                        expect(mb.pending).toBe(1);

                        mb.push('test');
                        await expectation;
                        expect(mb.pending).toBe(0);

                        await wait(150);
                    });
                });
            });
        });
    });
    describe('clear', function () {
        describe('when there are pending messages', function () {
            beforeEach(function () {
                mb.push('test1');
                mb.push('test2');
                mb.push('test3');
            });
            it('discards the messages', function () {
                expect(mb.length).toBe(3);
                expect(() => mb.clear()).not.toThrow();
                expect(mb.length).toBe(0);
            });
        });

        describe('when there are pending resolvers', function () {
            let promises = [];
            beforeEach(function () {
                promises.push(mb.pop());
                promises.push(mb.pop());
                promises.push(mb.pop());
            });
            it('rejects the resolvers', async function () {
                expect(mb.pending).toBe(3);
                expect(() => mb.clear('reason')).not.toThrow();
                expect(mb.pending).toBe(0);
                await Promise.all(
                    promises.map((promise) =>
                        expect(promise).rejects.toBe('reason')
                    )
                );
            });
        });
    });
});
