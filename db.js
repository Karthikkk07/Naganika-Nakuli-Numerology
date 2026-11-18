const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'numerology.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    service TEXT NOT NULL,
    mode TEXT,
    dob TEXT,
    pref_date TEXT,
    message TEXT NOT NULL,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    order_id TEXT,
    payment_id TEXT,
    amount INTEGER,
    service TEXT,
    name TEXT,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    topic TEXT,
    solution TEXT,
    service TEXT
  );
  CREATE TABLE IF NOT EXISTS blogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    body TEXT NOT NULL,
    image TEXT,
    published INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'video',
    title TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('youtube', 'https://www.youtube.com/'),
    ('instagram', '#'),
    ('linkedin', '#');
`);

const insertEnquiry = db.prepare(
  `INSERT INTO enquiries (id, received_at, name, email, phone, phone_verified, service, mode, dob, pref_date, message, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertPayment = db.prepare(
  `INSERT INTO payments (created_at, order_id, payment_id, amount, service, name, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertChat = db.prepare(`INSERT INTO chat_leads (created_at, topic, solution, service) VALUES (?, ?, ?, ?)`);

module.exports = {
  db,
  addEnquiry: (e) =>
    insertEnquiry.run(e.id, e.receivedAt, e.name, e.email, e.phone, e.phoneVerified ? 1 : 0, e.service, e.mode, e.dob, e.date, e.message, e.source),
  addPayment: (p) => insertPayment.run(new Date().toISOString(), p.orderId, p.paymentId || null, p.amount || null, p.service || '', p.name || '', p.status),
  markPaymentPaid: (orderId, paymentId) =>
    db.prepare(`UPDATE payments SET status = 'paid', payment_id = ? WHERE order_id = ?`).run(paymentId, orderId),
  addChatLead: (c) => insertChat.run(new Date().toISOString(), c.topic || '', c.solution || '', c.service || ''),
  listEnquiries: () => db.prepare(`SELECT * FROM enquiries ORDER BY received_at DESC LIMIT 1000`).all(),
  listPayments: () => db.prepare(`SELECT * FROM payments ORDER BY id DESC LIMIT 500`).all(),
  listChatLeads: () => db.prepare(`SELECT * FROM chat_leads ORDER BY id DESC LIMIT 500`).all(),
  updateEnquiry: (id, status, notes) => db.prepare(`UPDATE enquiries SET status = ?, notes = ? WHERE id = ?`).run(status, notes, id),
  deleteEnquiry: (id) => db.prepare(`DELETE FROM enquiries WHERE id = ?`).run(id),

  listBlogs: (onlyPublished) =>
    db.prepare(`SELECT id, created_at, title, summary, image, published FROM blogs ${onlyPublished ? 'WHERE published = 1' : ''} ORDER BY id DESC`).all(),
  getBlog: (id) => db.prepare(`SELECT * FROM blogs WHERE id = ?`).get(id),
  addBlog: (b) =>
    db.prepare(`INSERT INTO blogs (created_at, title, summary, body, image, published) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(new Date().toISOString(), b.title, b.summary, b.body, b.image, b.published ? 1 : 0),
  updateBlog: (id, b) =>
    db.prepare(`UPDATE blogs SET title = ?, summary = ?, body = ?, image = ?, published = ? WHERE id = ?`)
      .run(b.title, b.summary, b.body, b.image, b.published ? 1 : 0, id),
  deleteBlog: (id) => db.prepare(`DELETE FROM blogs WHERE id = ?`).run(id),

  listVideos: () => db.prepare(`SELECT * FROM videos ORDER BY id DESC`).all(),
  addVideo: (v) => db.prepare(`INSERT INTO videos (created_at, youtube_id, kind, title) VALUES (?, ?, ?, ?)`).run(new Date().toISOString(), v.youtubeId, v.kind, v.title),
  deleteVideo: (id) => db.prepare(`DELETE FROM videos WHERE id = ?`).run(id),

  getSettings: () => Object.fromEntries(db.prepare(`SELECT key, value FROM settings`).all().map((r) => [r.key, r.value])),
  setSetting: (key, value) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value),
};
