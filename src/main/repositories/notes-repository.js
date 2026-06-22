'use strict';

class NotesRepository {
  constructor(db) {
    this.db = db;
  }

  getNotes(search = '') {
    if (search) {
      return this.db.prepare(`
        SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?
        ORDER BY is_pinned DESC, updated_at DESC
      `).all(`%${search}%`, `%${search}%`);
    }
    return this.db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC').all();
  }

  addNote({ title, content, is_pinned = 0 }) {
    const result = this.db.prepare(
      'INSERT INTO notes (title, content, is_pinned) VALUES (?, ?, ?)'
    ).run(title, content, is_pinned ? 1 : 0);
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  }

  updateNote(id, { title, content, is_pinned }) {
    return this.db.prepare(`
      UPDATE notes SET title=?, content=?, is_pinned=?, updated_at=datetime('now') WHERE id=?
    `).run(title, content, is_pinned ? 1 : 0, id);
  }

  deleteNote(id) {
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }
}

module.exports = NotesRepository;
