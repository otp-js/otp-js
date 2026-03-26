/* eslint-env mocha */
import { Mailbox } from '#context/mailbox';
import * as matching from '@otpjs/matching';
import { t } from '@otpjs/types';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';
import * as Symbols from '#symbols';

const { ok, timeout, already_receiving } = Symbols;
const { _, spread } = matching.Symbols;

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(function() {
    sinon.restore();
})

describe('@otpjs/Mailbox', function() {
    it('is a type of array', function() {
        const mb = new Mailbox();
        expect(Array.isArray(mb)).to.equal(true);
    });

    describe('after pushing', function() {
        describe('when there is no predicate pending', function() {
            it('increases its length by 1', function() {
                const mb = new Mailbox();
                expect(mb.length).to.equal(0);

                for (let i = 0; i < 10; i++) {
                    expect(mb.length).to.equal(i);
                    mb.push('test');
                    expect(mb.length).to.equal(i + 1);
                }
            });
        });
        describe('when there is a predicate pending', function() {
            describe('which matches the message', function() {
                it('should have no contents', async function() {
                    const mb = new Mailbox();
                    expect(mb.pending).to.equal(0);
                    expect(mb.length).to.equal(0);

                    const promiseA = mb.pop();
                    expect(mb.isReceiving).to.equal(true);

                    mb.push('test');

                    expect(mb.length).to.equal(0);
                    expect(mb.isReceiving).to.equal(false);

                    await expect(promiseA).to.eventually.matchPattern(
                        t(ok, 'test')
                    );
                });
            });
            describe('which does not match the message', function() {
                it('increases its length by 1', function() {
                    const mb = new Mailbox();
                    mb.pop(() => false);
                    expect(mb.length).to.equal(0);

                    for (let i = 0; i < 10; i++) {
                        expect(mb.length).to.equal(i);
                        mb.push('test');
                        expect(mb.length).to.equal(i + 1);
                    }
                });
            });
        });
    });
    describe('pop', function() {
        describe('when already receiving', function() {
            it('throws an error', async function() {
                const mb = new Mailbox();
                mb.pop();

                await expect(mb.pop()).to.be.rejectedWithTerm(
                    already_receiving
                );
            });
        });
        describe('with a timeout', function() {
            describe('with no predicate', function() {
                describe('when there are available messages', function() {
                    it('takes messages in the order they were inserted', async function() {
                        const mb = new Mailbox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');

                        expect(await mb.pop(100)).to.matchPattern(t(ok, 'test'));
                        expect(await mb.pop(100)).to.matchPattern(
                            t(ok, 'test2')
                        );
                        expect(await mb.pop(100)).to.matchPattern(
                            t(ok, 'test3')
                        );
                    });
                    it('only takes messages that match the specified pattern', async function() {
                        const mb = new Mailbox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');

                        const match = (predicate) => (message) =>
                            predicate(message)
                                ? Promise.resolve(t(ok, message))
                                : false;

                        await expect(
                            mb.pop(match(matching.compile('test2')), 100)
                        ).to.eventually.matchPattern(t(ok, 'test2'));
                        await expect(
                            mb.pop(match(matching.compile('test3')), 100)
                        ).to.eventually.matchPattern(t(ok, 'test3'));
                        await expect(
                            mb.pop(match(matching.compile('test')), 100)
                        ).to.eventually.matchPattern(t(ok, 'test'));
                    });
                });
                describe('when there are no available messages', function() {
                    it('throws a timeout error if its timer expires', async function() {
                        const mb = new Mailbox();
                        await expect(mb.pop(100)).to.be.rejectedWithTerm(timeout);
                    });
                });
            });
            describe('with a predicate', function() {
                it('will not throw given an incompatible message', async function() {
                    const mb = new Mailbox();
                    mb.push({ iam: 'not_iterable' });
                    const promise = mb.pop(() => {
                        throw Error('badarg');
                    }, 100);
                    mb.push({ iam: 'not_iterable' });
                    await expect(promise).to.be.rejectedWithTerm(timeout);
                });
                describe('when there are available messages', function() {
                    it('returns the first matching message', async function() {
                        const mb = new Mailbox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                        await expect(
                            mb.pop(
                                (message) =>
                                    message === 'test2'
                                        ? Promise.resolve(t(ok, message))
                                        : false,
                                100
                            )
                        ).to.eventually.matchPattern(t(ok, 'test2'));
                        expect(mb.length).to.equal(2);
                    });

                    it('will wait if none of the messages match', async function() {
                        const mb = new Mailbox();
                        mb.push('test');
                        mb.push('test2');
                        mb.push('test3');
                        const request = mb.pop((m) => m === 'test4', 100);
                        const expectation =
                            expect(request).to.be.rejectedWithTerm(timeout);
                        expect(mb.isReceiving).to.equal(true);
                        await expectation;
                        expect(mb.isReceiving).to.equal(false);
                    });
                });
                describe('when there are no available messages', function() {
                    it('times out if no message is received', async function() {
                        const mb = new Mailbox();
                        const request = mb.pop((m) => m === 'test', 100);
                        const expectation =
                            expect(request).to.be.rejectedWithTerm(timeout);
                        expect(mb.isReceiving).to.equal(true);
                        await expectation;
                        expect(mb.isReceiving).to.equal(false);
                    });
                    it('does not time out if a matching message is received', async function() {
                        const mb = new Mailbox();
                        const request = mb.pop(
                            (m) =>
                                m === 'test'
                                    ? Promise.resolve(t(ok, m))
                                    : false,
                            100
                        );
                        const expectation = expect(
                            request
                        ).to.eventually.matchPattern(t(ok, 'test'));
                        expect(mb.isReceiving).to.equal(true);

                        mb.push('test');
                        await expectation;
                        expect(mb.isReceiving).to.equal(false);

                        await wait(150);
                    });
                });
            });
        });
        describe('without a timeout', function() {
            describe('with no predicate', function() {
                it('returns the first message available', async function() {
                    const mb = new Mailbox();
                    mb.push('first');
                    mb.push('second');
                    mb.push('third');
                    await expect(mb.pop()).to.eventually.matchPattern(
                        t(ok, 'first')
                    );
                    await expect(mb.pop()).to.eventually.matchPattern(
                        t(ok, 'second')
                    );
                    await expect(mb.pop()).to.eventually.matchPattern(
                        t(ok, 'third')
                    );
                });
            });
            describe('with a predicate', function() {
                it('returns the result of the predicate', function() { });
            });
        });
    });
    describe('clear', function() {
        describe('when there are pending messages', function() {
            it('discards the messages', function() {
                const mb = new Mailbox();
                mb.push('test1');
                mb.push('test2');
                mb.push('test3');
                expect(mb.length).to.equal(3);
                expect(() => mb.clear()).not.to.throw();
                expect(mb.length).to.equal(0);
            });
        });

        describe('when there is a pending resolvers', function() {
            it('rejects the receiver', async function() {
                const mb = new Mailbox();
                const promise = mb.pop();
                expect(mb.isReceiving).to.equal(true);
                expect(() => mb.clear('reason')).not.to.throw();
                expect(mb.isReceiving).to.equal(false);
                await expect(promise).to.be.rejectedWith('reason');
            });
        });
    });
});
