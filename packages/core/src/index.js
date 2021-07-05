import debug from 'debug';

const log = debug('otp-js:core');

export class MessageBox extends Array {
  static resolvers = Symbol();

  constructor(...args) {
    super(...args);
    this[MessageBox.resolvers] = [];
  }

  push(message) {
    const resolvers = this[MessageBox.resolvers];

    if (resolvers.length > 0) {
      const [resolve, reject] = resolvers.pop();
      resolve(message);
    } else {
      super.push(message);
    }
  }

  async pop(message) {
    const resolvers = this[MessageBox.resolvers];
    return new Promise((resolve, reject) => {
      if (this.length > 0) {
        resolve(super.pop());
      } else {
        resolvers.push([resolve, reject]);
      }
    })
  }
}
