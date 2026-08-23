'use strict';

class AnalyticsRepository {
  constructor(db) {
    this.db = db;
    this.activeUserId = null;
  }

  setActiveUser(userId) {
    this.activeUserId = (userId !== undefined && userId !== null && userId !== '')
      ? (typeof userId === 'number' ? userId : parseInt(userId, 10) || userId)
      : null;
  }

  getFocusModeStats() {
    const uid = this.activeUserId;
    if (uid === null) return { allTimeMinutes: 0, allTimeSessions: 0, todayMinutes: 0 };

    const allTime = this.db.prepare(`
      SELECT COALESCE(SUM(duration_minutes),0) as total_minutes, COUNT(*) as session_count
      FROM sessions WHERE is_focus_mode = 1 AND user_id = ?
    `).get(uid);

    const todayRow = this.db.prepare(`
      SELECT COALESCE(SUM(duration_minutes),0) as total_minutes
      FROM sessions WHERE is_focus_mode = 1 AND date(started_at) = date('now') AND user_id = ?
    `).get(uid);

    return {
      allTimeMinutes:  allTime.total_minutes,
      allTimeSessions: allTime.session_count,
      todayMinutes:    todayRow.total_minutes
    };
  }

  getXPTrend() {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`
      SELECT date(earned_at) as date, SUM(amount) as xp
      FROM xp_log WHERE earned_at >= datetime('now','-14 days') AND user_id = ?
      GROUP BY date(earned_at) ORDER BY date ASC
    `).all(uid);
  }

  getWeeklyStats() {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`
      SELECT date(due_date) as date,
             COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
             COALESCE(SUM(estimated_minutes),0) as planned_minutes
      FROM tasks
      WHERE due_date >= date('now','-6 days') AND status != 'deleted' AND user_id = ?
      GROUP BY date(due_date) ORDER BY date ASC
    `).all(uid);
  }

  getMonthlyStats() {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`
      SELECT date(started_at) as date, COALESCE(SUM(duration_minutes),0) as total_minutes
      FROM sessions WHERE started_at >= datetime('now','-29 days') AND user_id = ?
      GROUP BY date(started_at) ORDER BY date ASC
    `).all(uid);
  }

  getCategoryStats() {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`
      SELECT category,
             COUNT(*) as task_count,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_count,
             COALESCE(SUM(xp_reward),0) as total_xp
      FROM tasks WHERE status != 'deleted' AND user_id = ?
      GROUP BY category
    `).all(uid);
  }

  getTodayStudyMinutes() {
    const uid = this.activeUserId;
    if (uid === null) return 0;

    return this.db.prepare(`
      SELECT COALESCE(SUM(duration_minutes),0) as total
      FROM sessions WHERE date(started_at) = date('now') AND user_id = ?
    `).get(uid).total;
  }

  getScoreHistory(days = 14) {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`
      SELECT * FROM productivity_scores WHERE date >= date('now', '-' || ? || ' days') AND user_id = ? ORDER BY date ASC
    `).all(days, uid);
  }

  getWeeklyReviewStats() {
    const uid = this.activeUserId;
    if (uid === null) {
      return {
        hoursStudied: 0,
        focusMinutes: 0,
        sessionCount: 0,
        tasksCompleted: 0,
        tasksDue: 0,
        completionRate: null,
        xpEarned: 0,
        dailyBreakdown: []
      };
    }

    const sessionRow = this.db.prepare(`
      SELECT COALESCE(SUM(duration_minutes),0) as total_minutes, COUNT(*) as session_count
      FROM sessions WHERE date(started_at) >= date('now','-6 days') AND user_id = ?
    `).get(uid);

    const tasksRow = this.db.prepare(`
      SELECT COUNT(*) as completed_count FROM tasks
      WHERE status='completed' AND date(completed_at) >= date('now','-6 days') AND user_id = ?
    `).get(uid);

    const tasksDueRow = this.db.prepare(`
      SELECT COUNT(*) as total_due FROM tasks
      WHERE status != 'deleted'
        AND due_date IS NOT NULL AND due_date != ''
        AND date(due_date) >= date('now','-6 days') AND date(due_date) <= date('now') AND user_id = ?
    `).get(uid);

    const xpRow = this.db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total_xp FROM xp_log WHERE date(earned_at) >= date('now','-6 days') AND user_id = ?
    `).get(uid);

    const dailyBreakdown = this.db.prepare(`
      SELECT d.date,
             COALESCE(s.minutes,0)    as focus_minutes,
             COALESCE(t.completed,0)  as tasks_completed,
             COALESCE(x.xp,0)         as xp_earned
      FROM (
        SELECT date('now', '-' || n || ' days') as date
        FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6)
      ) d
      LEFT JOIN (SELECT date(started_at) as date, SUM(duration_minutes) as minutes FROM sessions WHERE user_id = ? GROUP BY date(started_at)) s ON s.date=d.date
      LEFT JOIN (SELECT date(completed_at) as date, COUNT(*) as completed FROM tasks WHERE status='completed' AND user_id = ? GROUP BY date(completed_at)) t ON t.date=d.date
      LEFT JOIN (SELECT date(earned_at) as date, SUM(amount) as xp FROM xp_log WHERE user_id = ? GROUP BY date(earned_at)) x ON x.date=d.date
      ORDER BY d.date ASC
    `).all(uid, uid, uid);

    const completionRate = tasksDueRow.total_due > 0
      ? Math.round((tasksRow.completed_count / tasksDueRow.total_due) * 100)
      : null;

    return {
      hoursStudied:  Math.round((sessionRow.total_minutes / 60) * 10) / 10,
      focusMinutes:  sessionRow.total_minutes,
      sessionCount:  sessionRow.session_count,
      tasksCompleted: tasksRow.completed_count,
      tasksDue:      tasksDueRow.total_due,
      completionRate,
      xpEarned:      xpRow.total_xp,
      dailyBreakdown
    };
  }
}

module.exports = AnalyticsRepository;

