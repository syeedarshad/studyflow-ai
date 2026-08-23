'use strict';

class RoadmapRepository {
  constructor(db) {
    this.db = db;
    this.activeUserId = null;
  }

  setActiveUser(userId) {
    this.activeUserId = (userId !== undefined && userId !== null && userId !== '')
      ? (typeof userId === 'number' ? userId : parseInt(userId, 10) || userId)
      : null;
  }

  addCareerRoadmap({ title, targetRole, description, totalMonths }) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    const result = this.db.prepare(`
      INSERT INTO career_roadmaps (title, target_role, description, total_months, user_id) VALUES (?,?,?,?,?)
    `).run(title, targetRole, description || '', totalMonths || 3, uid);
    return this.getCareerRoadmap(result.lastInsertRowid);
  }

  getCareerRoadmap(id) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    const roadmap = this.db.prepare('SELECT * FROM career_roadmaps WHERE id = ? AND user_id = ?').get(id, uid);
    if (!roadmap) return null;
    roadmap.milestones = this.db.prepare('SELECT * FROM roadmap_milestones WHERE roadmap_id = ? ORDER BY month_number ASC').all(id)
      .map(m => {
        try { m.skills   = JSON.parse(m.skills   || '[]'); } catch { m.skills   = []; }
        try { m.projects = JSON.parse(m.projects || '[]'); } catch { m.projects = []; }
        return m;
      });
    return roadmap;
  }

  getAllCareerRoadmaps() {
    const uid = this.activeUserId;
    if (uid === null) return [];

    return this.db.prepare(`SELECT * FROM career_roadmaps WHERE status != 'deleted' AND user_id = ? ORDER BY created_at DESC`).all(uid)
      .map(r => this.getCareerRoadmap(r.id))
      .filter(Boolean);
  }

  addRoadmapMilestones(roadmapId, milestones) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    // Verify roadmap ownership
    const roadmap = this.db.prepare('SELECT id FROM career_roadmaps WHERE id = ? AND user_id = ?').get(roadmapId, uid);
    if (!roadmap) return null;

    const insert = this.db.prepare(`INSERT INTO roadmap_milestones (roadmap_id,month_number,title,description,skills,projects) VALUES (?,?,?,?,?,?)`);
    const insertMany = this.db.transaction(items => {
      items.forEach(m => insert.run(roadmapId, m.month_number, m.title, m.description || '', JSON.stringify(m.skills || []), JSON.stringify(m.projects || [])));
    });
    insertMany(milestones);
    return this.getCareerRoadmap(roadmapId);
  }

  updateMilestoneStatus(milestoneId, status) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    // Verify milestone belongs to a roadmap owned by uid
    const milestone = this.db.prepare(`
      SELECT m.id FROM roadmap_milestones m
      JOIN career_roadmaps r ON m.roadmap_id = r.id
      WHERE m.id = ? AND r.user_id = ?
    `).get(milestoneId, uid);
    if (!milestone) return null;

    return this.db.prepare('UPDATE roadmap_milestones SET status = ? WHERE id = ?').run(status, milestoneId);
  }

  deleteCareerRoadmap(id) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    // Verify ownership before deleting milestones
    const roadmap = this.db.prepare('SELECT id FROM career_roadmaps WHERE id = ? AND user_id = ?').get(id, uid);
    if (!roadmap) return null;

    this.db.prepare('DELETE FROM roadmap_milestones WHERE roadmap_id = ?').run(id);
    return this.db.prepare(`UPDATE career_roadmaps SET status = 'deleted' WHERE id = ? AND user_id = ?`).run(id, uid);
  }
}

module.exports = RoadmapRepository;

