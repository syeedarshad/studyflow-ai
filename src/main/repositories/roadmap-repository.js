'use strict';

class RoadmapRepository {
  constructor(db) {
    this.db = db;
  }

  addCareerRoadmap({ title, targetRole, description, totalMonths }) {
    const result = this.db.prepare(`
      INSERT INTO career_roadmaps (title, target_role, description, total_months) VALUES (?,?,?,?)
    `).run(title, targetRole, description||'', totalMonths||3);
    return this.getCareerRoadmap(result.lastInsertRowid);
  }

  getCareerRoadmap(id) {
    const roadmap = this.db.prepare('SELECT * FROM career_roadmaps WHERE id=?').get(id);
    if (!roadmap) return null;
    roadmap.milestones = this.db.prepare('SELECT * FROM roadmap_milestones WHERE roadmap_id=? ORDER BY month_number ASC').all(id)
      .map(m => {
        try { m.skills   = JSON.parse(m.skills   || '[]'); } catch { m.skills   = []; }
        try { m.projects = JSON.parse(m.projects || '[]'); } catch { m.projects = []; }
        return m;
      });
    return roadmap;
  }

  getAllCareerRoadmaps() {
    return this.db.prepare(`SELECT * FROM career_roadmaps WHERE status!='deleted' ORDER BY created_at DESC`).all()
      .map(r => this.getCareerRoadmap(r.id));
  }

  addRoadmapMilestones(roadmapId, milestones) {
    const insert = this.db.prepare(`INSERT INTO roadmap_milestones (roadmap_id,month_number,title,description,skills,projects) VALUES (?,?,?,?,?,?)`);
    const insertMany = this.db.transaction(items => {
      items.forEach(m => insert.run(roadmapId, m.month_number, m.title, m.description||'', JSON.stringify(m.skills||[]), JSON.stringify(m.projects||[])));
    });
    insertMany(milestones);
    return this.getCareerRoadmap(roadmapId);
  }

  updateMilestoneStatus(milestoneId, status) {
    return this.db.prepare('UPDATE roadmap_milestones SET status=? WHERE id=?').run(status, milestoneId);
  }

  deleteCareerRoadmap(id) {
    this.db.prepare('DELETE FROM roadmap_milestones WHERE roadmap_id=?').run(id);
    this.db.prepare(`UPDATE career_roadmaps SET status='deleted' WHERE id=?`).run(id);
  }
}

module.exports = RoadmapRepository;
