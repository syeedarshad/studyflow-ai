/**
 * StudyFlow AI — Upload API  (Phase 5 stub)
 */
'use strict';
const api = require('./api-client');
const UploadAPI = {
  async uploadFile(file, type = 'general') {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    // Uses raw fetch for multipart/form-data
    const token = api.getToken();
    const res = await fetch(`${api.API_BASE}/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    return { success: res.ok, data, status: res.status };
  },
  async getUploads()   { return api.get('/uploads'); },
  async deleteUpload(id) { return api.delete(`/uploads/${id}`); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = UploadAPI;
