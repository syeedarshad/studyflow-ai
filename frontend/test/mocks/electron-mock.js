/**
 * Test-only mock of the 'electron' module's API surface (app, safeStorage).
 * See test/setup.js for how this gets wired in.
 */
'use strict';
const crypto = require('crypto');
const path = require('path');
const KEY = crypto.scryptSync('studyflow-test-fixed-key', 'salt', 32);

module.exports = {
  app: {
    getPath: () => path.join(__dirname, '..', '.tmp-test-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (str) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([iv, cipher.update(str, 'utf8'), cipher.final()]);
    },
    decryptString: (buf) => {
      const iv = buf.subarray(0, 16), encrypted = buf.subarray(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
  }
};