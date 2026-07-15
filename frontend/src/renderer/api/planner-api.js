/**
 * StudyFlow AI — Planner API
 * Phase 3 stub — backend implementation in Phase 3.
 */
'use strict';

const api = require('./api-client');

const PlannerAPI = {
  async getTasks(date) {
    return api.get(`/planner/tasks?date=${date || ''}`);
  },
  async addTask(task) {
    return api.post('/planner/tasks', task);
  },
  async updateTask(id, updates) {
    return api.put(`/planner/tasks/${id}`, updates);
  },
  async deleteTask(id) {
    return api.delete(`/planner/tasks/${id}`);
  },
  async completeTask(id) {
    return api.post(`/planner/tasks/${id}/complete`, {});
  },
  async getGoals(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/planner/goals${params ? '?' + params : ''}`);
  },
  async addGoal(goal) {
    return api.post('/planner/goals', goal);
  },
  async updateGoal(id, updates) {
    return api.put(`/planner/goals/${id}`, updates);
  },
  async deleteGoal(id) {
    return api.delete(`/planner/goals/${id}`);
  },
  async getNotes() {
    return api.get('/planner/notes');
  },
  async addNote(note) {
    return api.post('/planner/notes', note);
  },
  async updateNote(id, updates) {
    return api.put(`/planner/notes/${id}`, updates);
  },
  async deleteNote(id) {
    return api.delete(`/planner/notes/${id}`);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = PlannerAPI;
