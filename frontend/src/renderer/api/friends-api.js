/**
 * StudyFlow AI — Friends API  (Phase 4 stub)
 */
'use strict';
const FriendsAPI = {
  async search(query)           { return api.get(`/friends/search?q=${encodeURIComponent(query)}`); },
  async getAll()                { return api.get('/friends'); },
  async sendRequest(userId)     { return api.post('/friends/requests', { user_id: userId }); },
  async acceptRequest(id)       { return api.post(`/friends/requests/${id}/accept`, {}); },
  async rejectRequest(id)       { return api.post(`/friends/requests/${id}/reject`, {}); },
  async cancelRequest(id)       { return api.delete(`/friends/requests/${id}`); },
  async removeFriend(userId)    { return api.delete(`/friends/${userId}`); },
  async block(userId)           { return api.post(`/friends/${userId}/block`, {}); },
  async unblock(userId)         { return api.post(`/friends/${userId}/unblock`, {}); },
  async getPendingRequests()    { return api.get('/friends/requests/pending'); },
  async getMutualFriends(userId){ return api.get(`/friends/${userId}/mutual`); },
  async getOnlineStatus()       { return api.get('/friends/online-status'); },
};
// window.FriendsAPI = FriendsAPI;  // expose if needed via <script> tag
