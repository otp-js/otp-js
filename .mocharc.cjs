const { resolve } = require('node:path');
const setupTests = resolve(__dirname, 'setup-tests.js');
console.log('setupTests: %o', setupTests);
module.exports = {
    require: setupTests,
};
