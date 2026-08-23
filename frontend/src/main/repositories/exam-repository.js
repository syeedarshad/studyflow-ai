'use strict';

class ExamRepository {
  constructor(db) {
    this.db = db;
    this.activeUserId = null;
  }

  setActiveUser(userId) {
    this.activeUserId = (userId !== undefined && userId !== null && userId !== '')
      ? (typeof userId === 'number' ? userId : parseInt(userId, 10) || userId)
      : null;
  }

  addExamPrep({ examName, examDate, description }) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    const result = this.db.prepare(`INSERT INTO exam_preps (exam_name,exam_date,description,user_id) VALUES (?,?,?,?)`).run(examName, examDate || null, description || '', uid);
    return this.db.prepare('SELECT * FROM exam_preps WHERE id=? AND user_id=?').get(result.lastInsertRowid, uid);
  }

  getAllExamPreps() {
    const uid = this.activeUserId;
    if (uid === null) return [];
    return this.db.prepare(`SELECT * FROM exam_preps WHERE status != 'deleted' AND user_id = ? ORDER BY exam_date ASC`).all(uid);
  }

  deleteExamPrep(id) {
    const uid = this.activeUserId;
    if (uid === null) return null;
    return this.db.prepare(`UPDATE exam_preps SET status = 'deleted' WHERE id = ? AND user_id = ?`).run(id, uid);
  }

  getAcceptedExamPlan(examId) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    const exam = this.db.prepare("SELECT * FROM exam_preps WHERE id = ? AND status != 'deleted' AND user_id = ?").get(examId, uid);
    if (!exam) return null;

    const row = this.db.prepare(`
      SELECT payload FROM pending_plans 
      WHERE type = 'exam_plan' AND status = 'accepted' AND user_id = ? AND json_extract(payload, '$.exam_id') = ?
      ORDER BY resolved_at DESC LIMIT 1
    `).get(uid, examId);

    let planData = { plan: {}, tasks: [] };
    if (row) {
      try { planData = JSON.parse(row.payload); } catch { /* ignore parse errors */ }
    }

    return {
      exam,
      plan: planData.plan,
      tasks: planData.tasks
    };
  }
}

module.exports = ExamRepository;

