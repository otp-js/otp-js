import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';
import chaiMatching from '@otpjs/matching/chai';

chai.use(chaiMatching);
chai.use(sinonChai);
chai.use(chaiAsPromised);
