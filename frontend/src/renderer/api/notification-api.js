/**
 * StudyFlow AI — Notification API  (Phase 4 stub)
 */
'use strict';
const api = require('./api-client');
const NotificationAPI = {
  async getAll(limit)    { return api.get(`/notifications?limit=${limit || 50}`); },
  async getUnreadCount() { return api.get('/notifications/unread-count'); },
  async markRead(id)     { return api.post(`/notifications/${id}/read`, {}); },
  async markAllRead()    { return api.post('/notifications/read-all', {}); },
  async delete(id)       { return api.delete(`/notifications/${id}`); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = NotificationAPI;
