/**
 * StudyFlow AI — Memory API
 * Phase 2 stub — backend implementation in Phase 2.
 */
'use strict';

const api = require('./api-client');

const MemoryAPI = {
  async getAll() {
    return api.get('/memory');
  },
  async set(key, value) {
    return api.post('/memory', { key, value });
  },
  async getPreferences() {
    return api.get('/memory/preferences');
  },
  async updatePreferences(prefs) {
    return api.put('/memory/preferences', prefs);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = MemoryAPI;
