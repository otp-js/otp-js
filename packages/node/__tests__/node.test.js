/* eslint-env mocha */
import { Node } from '#node';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);

const { expect } = chai;

afterEach(function() {
    sinon.restore();
})

describe('@otpjs/node', function() {
    describe('addFunction', function() {
        describe('with a unique name', function() {
            it('adds a function', function() {
                const node = new Node();
                node.addFunction('foo', sinon.stub());
                expect(() => node.exec('foo', [])).not.to.throw();
            });
        });
        describe('with a duplicate name', function() {
            it('throws an error', function() {
                const node = new Node();
                node.addFunction('foo', sinon.stub());
                expect(() => node.addFunction('foo', sinon.stub())).to.throw();
            });
        });
    });
    describe('exec', function() {
        describe('with a registered function', function() {
            it('executes the function', function() {
                const node = new Node();
                const impl = sinon.stub();
                node.addFunction('foo', impl);
                expect(() => node.exec('foo', [])).not.to.throw();
                expect(impl).to.have.been.called;
            });
            describe('with arguments', function() {
                it('executes the function', function() {
                    const node = new Node();
                    const impl = sinon.stub();
                    node.addFunction('foo', impl);
                    expect(() => node.exec('foo', [1, 2, 3])).not.to.throw();
                    expect(impl).to.have.been.calledWith(1, 2, 3);
                });
            });
            describe('with no arguments', function() {
                it('executes the function', function() {
                    const node = new Node();
                    const impl = sinon.stub();
                    node.addFunction('foo', impl);
                    expect(() => node.exec('foo')).not.to.throw();
                    expect(impl).to.have.been.calledWith();
                });
            });
        });
        describe('with an unregistered function', function() {
            it('throws an error', function() {
                const node = new Node();
                expect(() => node.exec('foo', [])).to.throw();
            });
        });
    });
});
