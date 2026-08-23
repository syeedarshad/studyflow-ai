'use strict';

class NotesRepository {
  constructor(db) {
    this.db = db;
    this.activeUserId = null;
  }

  setActiveUser(userId) {
    this.activeUserId = (userId !== undefined && userId !== null && userId !== '')
      ? (typeof userId === 'number' ? userId : parseInt(userId, 10) || userId)
      : null;
  }

  getNotes(search = '') {
    const uid = this.activeUserId;
    if (uid === null) return [];

    if (search) {
      return this.db.prepare(`
        SELECT * FROM notes 
        WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
        ORDER BY is_pinned DESC, updated_at DESC
      `).all(uid, `%${search}%`, `%${search}%`);
    }

    return this.db.prepare(`
      SELECT * FROM notes 
      WHERE user_id = ?
      ORDER BY is_pinned DESC, updated_at DESC
    `).all(uid);
  }

  addNote(titleOrObj, contentArg, isPinnedArg = 0) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    let title, content, is_pinned;
    if (typeof titleOrObj === 'object' && titleOrObj !== null) {
      title = titleOrObj.title;
      content = titleOrObj.content;
      is_pinned = titleOrObj.is_pinned || 0;
    } else {
      title = titleOrObj;
      content = contentArg;
      is_pinned = isPinnedArg || 0;
    }

    const result = this.db.prepare(
      'INSERT INTO notes (title, content, is_pinned, user_id) VALUES (?, ?, ?, ?)'
    ).run(title || '', content || '', is_pinned ? 1 : 0, uid);
    return this.db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, uid);
  }

  updateNote(id, { title, content, is_pinned }) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    return this.db.prepare(`
      UPDATE notes SET title=?, content=?, is_pinned=?, updated_at=datetime('now') 
      WHERE id=? AND user_id=?
    `).run(title, content, is_pinned ? 1 : 0, id, uid);
  }

  deleteNote(id) {
    const uid = this.activeUserId;
    if (uid === null) return null;

    return this.db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(id, uid);
  }
}

module.exports = NotesRepository;
