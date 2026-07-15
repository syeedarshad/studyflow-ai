/**
 * StudyFlow AI — Analytics API  (Phase 3 stub)
 */
'use strict';
const api = require('./api-client');
const AnalyticsAPI = {
  async getXP()           { return api.get('/analytics/xp'); },
  async getStreak()       { return api.get('/analytics/streak'); },
  async getHeatmap(days)  { return api.get(`/analytics/heatmap?days=${days || 30}`); },
  async getLearning()     { return api.get('/analytics/learning'); },
  async getScores()       { return api.get('/analytics/scores'); },
  async getScoreHistory(days) { return api.get(`/analytics/scores/history?days=${days || 14}`); },
  async getBurnout()      { return api.get('/analytics/burnout'); },
  async getWeeklyReview() { return api.get('/analytics/weekly-review'); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = AnalyticsAPI;
