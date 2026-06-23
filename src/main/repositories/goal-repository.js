'use strict';

const { normalizeGoalTitle } = require('../utils');

class GoalRepository {
  constructor(db) {
    this.db = db;
  }

  addGoal(goal) {
    goal.title = (goal.title || '').trim();
    const normalized = normalizeGoalTitle(goal.title);

    // Prevent duplicate active goals
    const existing = this.db.prepare(`
      SELECT * FROM goals 
      WHERE normalized_title = @normalized AND status = 'active'
    `).get({ normalized });

    if (existing) {
      return { ...existing, isDuplicate: true };
    }

    const result = this.db.prepare(`
      INSERT INTO goals (title, normalized_title, description, goal_type, target_date, status, progress_percentage)
      VALUES (@title, @normalized, @description, @goal_type, @target_date, 'active', 0)
    `).run({ 
      title: goal.title, 
      normalized,
      description: goal.description||'', 
      goal_type: goal.goal_type||'custom', 
      target_date: goal.target_date||null 
    });
    return this.getGoal(result.lastInsertRowid);
  }

  getGoal(id) {
    return this.db.prepare('SELECT * FROM goals WHERE id=?').get(id);
  }

  getGoals(filter = {}) {
    let sql = `SELECT * FROM goals WHERE status != 'deleted'`;
    const params = [];
    if (filter.status) { sql += ' AND status=?'; params.push(filter.status); }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params).map(g => ({ ...g, ...this.computeGoalInsights(g) }));
  }

  updateGoal(id, updates) {
    const allowed = ['title','description','goal_type','target_date','status','progress_percentage'];
    const fields  = Object.keys(updates).filter(k => allowed.includes(k));
    if (!fields.length) return null;
    const setClause = fields.map(k => `${k}=@${k}`).join(', ');
    const params    = {};
    fields.forEach(k => { params[k] = updates[k]; });
    return this.db.prepare(`UPDATE goals SET ${setClause}, updated_at=datetime('now') WHERE id=@id`).run({ ...params, id });
  }

  deleteGoal(id) {
    return this.db.prepare(`UPDATE goals SET status='deleted', updated_at=datetime('now') WHERE id=?`).run(id);
  }

  getTasksForGoal(goalId) {
    return this.db.prepare(`SELECT * FROM tasks WHERE goal_id=? AND status != 'deleted' ORDER BY due_date ASC`).all(goalId);
  }

  getQuestsForGoal(goalId) {
    return this.db.prepare('SELECT * FROM daily_quests WHERE goal_id=? ORDER BY date ASC').all(goalId);
  }

  computeGoalInsights(goal) {
    const now        = new Date();
    const created    = new Date(goal.created_at);
    const daysElapsed = Math.max(1, Math.ceil((now - created) / 86400000));

    let daysRemaining = null, totalDuration = null;
    if (goal.target_date) {
      const target  = new Date(goal.target_date);
      daysRemaining = Math.ceil((target - now) / 86400000);
      totalDuration = Math.max(1, Math.ceil((target - created) / 86400000));
    }

    let forecastDays = null, paceStatus = 'no_data';
    if (goal.progress_percentage > 0) {
      const dailyRate = goal.progress_percentage / daysElapsed;
      forecastDays    = dailyRate > 0 ? Math.ceil(100 / dailyRate) : null;
      if (totalDuration && forecastDays) {
        if (forecastDays <= totalDuration - 2) paceStatus = 'ahead';
        else if (forecastDays <= totalDuration + 2) paceStatus = 'on_track';
        else paceStatus = 'behind';
      }
    } else if (daysRemaining !== null && daysRemaining < 0) {
      paceStatus = 'behind';
    }

    const recommendation = this.buildGoalRecommendation(goal, { daysRemaining, forecastDays, totalDuration, paceStatus, daysElapsed });
    return { daysElapsed, daysRemaining, totalDuration, forecastDays, paceStatus, recommendation };
  }

  buildGoalRecommendation(goal, { daysRemaining, forecastDays, totalDuration, paceStatus }) {
    if (goal.status === 'completed')                       return `🎉 Goal completed! Great work.`;
    if (daysRemaining !== null && daysRemaining < 0)      return `This goal's deadline has passed. Consider extending the target date or marking it complete.`;
    if (paceStatus === 'ahead')                            return `You are ahead of schedule.${forecastDays ? ` Current pace will finish this goal in ~${forecastDays} days.` : ''}`;
    if (paceStatus === 'on_track')                         return `You're on track.${forecastDays ? ` Current pace will finish this goal in ~${forecastDays} days.` : ''}`;

    if (paceStatus === 'behind') {
      const tasks   = this.getTasksForGoal(goal.id);
      const pending = tasks.filter(t => t.status === 'pending');
      if (pending.length > 0) {
        const catCounts  = {};
        pending.forEach(t => { catCounts[t.category] = (catCounts[t.category]||0) + 1; });
        const [topCat, topCount] = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];
        const weeklyTarget = Math.max(1, Math.ceil(topCount / Math.max(1, Math.ceil((daysRemaining||7)/7))));
        let msg = `You need ${weeklyTarget} more ${topCat} session${weeklyTarget>1?'s':''} this week to stay on pace.`;
        if (forecastDays && totalDuration) msg += ` Current pace will finish this goal in ~${forecastDays} days (target: ${totalDuration} days).`;
        return msg;
      }
      if (forecastDays) return `Current pace will finish this goal in ~${forecastDays} days. Consider adding more tasks to accelerate.`;
      return `Progress is behind pace. Consider breaking this goal into smaller tasks.`;
    }

    const tasks = this.getTasksForGoal(goal.id);
    if (tasks.length === 0) return `No tasks linked yet. Use the AI Goal Planner to generate a plan for this goal.`;
    if (goal.progress_percentage === 0) return `Complete your first linked task to start tracking progress.`;
    return `Keep going — every completed task moves this goal forward.`;
  }
}

module.exports = GoalRepository;
