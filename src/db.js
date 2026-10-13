'use strict';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { drawAssignments } = require('./draw');

const newToken = () => crypto.randomBytes(16).toString('base64url');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  budget        TEXT NOT NULL DEFAULT '',
  exchange_date TEXT NOT NULL DEFAULT '',
  admin_token   TEXT NOT NULL UNIQUE,
  invite_token  TEXT NOT NULL UNIQUE,
  drawn_at      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS participants (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL COLLATE NOCASE,
  wishlist     TEXT NOT NULL DEFAULT '',
  token        TEXT NOT NULL UNIQUE,
  is_organizer INTEGER NOT NULL DEFAULT 0,
  recipient_id INTEGER REFERENCES participants(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, name)
);
CREATE TABLE IF NOT EXISTS exclusions (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  a_id     INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  b_id     INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, a_id, b_id),
  CHECK (a_id < b_id)
);
`;

class Store {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  createEvent({ name, budget, exchangeDate, organizerName, organizerJoins }) {
    return this.tx(() => {
      const ev = this.db
        .prepare(`INSERT INTO events (name, budget, exchange_date, admin_token, invite_token)
                  VALUES (?, ?, ?, ?, ?) RETURNING *`)
        .get(name, budget, exchangeDate, newToken(), newToken());
      if (organizerJoins) this.addParticipant(ev.id, organizerName, '', true);
      return ev;
    });
  }

  eventByAdmin(token) {
    return this.db.prepare('SELECT * FROM events WHERE admin_token = ?').get(token);
  }

  eventByInvite(token) {
    return this.db.prepare('SELECT * FROM events WHERE invite_token = ?').get(token);
  }

  eventById(id) {
    return this.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  }

  /** Returns the new participant, or null if the name is already taken. */
  addParticipant(eventId, name, wishlist, isOrganizer = false) {
    try {
      return this.db
        .prepare(`INSERT INTO participants (event_id, name, wishlist, token, is_organizer)
                  VALUES (?, ?, ?, ?, ?) RETURNING *`)
        .get(eventId, name, wishlist, newToken(), isOrganizer ? 1 : 0);
    } catch (e) {
      if (/UNIQUE constraint failed: participants\.event_id/.test(e.message)) return null;
      throw e;
    }
  }

  participantByToken(token) {
    return this.db.prepare('SELECT * FROM participants WHERE token = ?').get(token);
  }

  participantById(id) {
    return this.db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
  }

  participants(eventId) {
    return this.db
      .prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY created_at, id')
      .all(eventId);
  }

  updateWishlist(participantId, wishlist) {
    this.db.prepare('UPDATE participants SET wishlist = ? WHERE id = ?').run(wishlist, participantId);
  }

  removeParticipant(eventId, participantId) {
    return this.db
      .prepare('DELETE FROM participants WHERE id = ? AND event_id = ?')
      .run(participantId, eventId).changes > 0;
  }

  exclusions(eventId) {
    return this.db
      .prepare(`SELECT x.a_id, x.b_id, a.name AS a_name, b.name AS b_name
                FROM exclusions x
                JOIN participants a ON a.id = x.a_id
                JOIN participants b ON b.id = x.b_id
                WHERE x.event_id = ? ORDER BY a.name, b.name`)
      .all(eventId);
  }

  /** Returns false if the pair is invalid (same person / not in this event). */
  addExclusion(eventId, x, y) {
    if (x === y) return false;
    const [a, b] = x < y ? [x, y] : [y, x];
    const ok = this.db
      .prepare('SELECT COUNT(*) AS n FROM participants WHERE event_id = ? AND id IN (?, ?)')
      .get(eventId, a, b).n === 2;
    if (!ok) return false;
    this.db
      .prepare('INSERT OR IGNORE INTO exclusions (event_id, a_id, b_id) VALUES (?, ?, ?)')
      .run(eventId, a, b);
    return true;
  }

  removeExclusion(eventId, x, y) {
    const [a, b] = x < y ? [x, y] : [y, x];
    this.db.prepare('DELETE FROM exclusions WHERE event_id = ? AND a_id = ? AND b_id = ?').run(eventId, a, b);
  }

  /** Runs the draw atomically. Throws DrawError when impossible; returns false if already drawn. */
  draw(eventId, rng) {
    return this.tx(() => {
      if (this.eventById(eventId).drawn_at) return false;
      const ids = this.participants(eventId).map((p) => p.id);
      const pairs = this.exclusions(eventId).map((x) => [x.a_id, x.b_id]);
      const result = drawAssignments(ids, pairs, rng);
      const set = this.db.prepare('UPDATE participants SET recipient_id = ? WHERE id = ?');
      for (const [giver, receiver] of result) set.run(receiver, giver);
      this.db.prepare("UPDATE events SET drawn_at = datetime('now') WHERE id = ?").run(eventId);
      return true;
    });
  }

  resetDraw(eventId) {
    this.tx(() => {
      this.db.prepare('UPDATE participants SET recipient_id = NULL WHERE event_id = ?').run(eventId);
      this.db.prepare('UPDATE events SET drawn_at = NULL WHERE id = ?').run(eventId);
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = { Store };
