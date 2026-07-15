/**
 * StudyFlow AI — Settings API  (Phase 3 stub)
 */
'use strict';
const api = require('./api-client');
const SettingsAPI = {
  async getAll()          { return api.get('/settings'); },
  async update(settings)  { return api.put('/settings', settings); },
  async getProfile()      { return api.get('/settings/profile'); },
  async updateProfile(p)  { return api.put('/settings/profile', p); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = SettingsAPI;
