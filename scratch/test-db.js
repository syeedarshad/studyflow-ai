const fs = require('fs');
const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return {
      app: {
        getPath: (name) => {
          if (name === 'userData') return 'C:\\Users\\sdars\\AppData\\Roaming\\studyflow-ai';
          return __dirname;
        }
      },
      ipcMain: { handle: () => {} }
    };
  }
  return originalRequire.apply(this, arguments);
};

const DB = require('../src/main/database.js');
const instance = new DB();
instance.getTasks({});
