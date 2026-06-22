'use strict';

class ExamRepository {
  constructor(db) {
    this.db = db;
  }

  addExamPrep({ examName, examDate, description }) {
    const result = this.db.prepare(`INSERT INTO exam_preps (exam_name,exam_date,description) VALUES (?,?,?)`).run(examName, examDate||null, description||'');
    return this.db.prepare('SELECT * FROM exam_preps WHERE id=?').get(result.lastInsertRowid);
  }

  getAllExamPreps() {
    return this.db.prepare(`SELECT * FROM exam_preps WHERE status!='deleted' ORDER BY exam_date ASC`).all();
  }

  deleteExamPrep(id) {
    this.db.prepare(`UPDATE exam_preps SET status='deleted' WHERE id=?`).run(id);
  }

  getAcceptedExamPlan(examId) {
    const exam = this.db.prepare("SELECT * FROM exam_preps WHERE id=? AND status!='deleted'").get(examId);
    if (!exam) return null;

    const row = this.db.prepare(`
      SELECT payload FROM pending_plans 
      WHERE type='exam_plan' AND status='accepted' AND json_extract(payload, '$.exam_id') = ?
      ORDER BY resolved_at DESC LIMIT 1
    `).get(examId);

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
