const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'sessions.json');
const MAX_HISTORY = 20;
const TTL_MS = 1000 * 60 * 60 * 24; // forget after 24h of inactivity

let sessions = load();

function load() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { }
  return {};
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(sessions));
  } catch (err) {
    console.error('session persist failed:', err.message);
  }
}

function get(userId) {
  const now = Date.now();
  const s = sessions[userId];
  if (!s || now - s.updatedAt > TTL_MS) {
    sessions[userId] = { state: 'new', history: [], updatedAt: now };
  }
  return sessions[userId];
}

function update(userId, patch) {
  const s = get(userId);
  Object.assign(s, patch, { updatedAt: Date.now() });
  persist();
  return s;
}

function pushHistory(userId, role, text) {
  const s = get(userId);
  s.history.push({ role, text, at: Date.now() });
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  s.updatedAt = Date.now();
  persist();
}

function reset(userId) {
  delete sessions[userId];
  persist();
}

module.exports = { get, update, pushHistory, reset };
