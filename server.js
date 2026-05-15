const express = require('express');
const initSqlJs = require('sql.js');
const ping = require('ping');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;
let db;
let SQL;

// Ensure absolute directories
const uploadsDir = path.resolve(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = file.fieldname === 'alarm' ? 'alarm' : 'logo';
    cb(null, name + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const DB_PATH = path.resolve(__dirname, 'pingmon.db');

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const res = dbGet("SELECT last_insert_rowid() as id");
  return { lastInsertRowid: res ? res.id : null };
}

// ============ INIT DB ============
async function initDb() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ip_address TEXT NOT NULL,
    location TEXT DEFAULT '', description TEXT DEFAULT '', group_name TEXT DEFAULT 'Default',
    is_active INTEGER DEFAULT 1, is_muted INTEGER DEFAULT 0, status TEXT DEFAULT 'unknown', 
    last_ping_ms REAL DEFAULT NULL, last_check TEXT DEFAULT NULL, 
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Migration: Add is_muted if it doesn't exist
  try {
    db.run("ALTER TABLE devices ADD COLUMN is_muted INTEGER DEFAULT 0");
    console.log("Migration: Added is_muted column to devices");
  } catch (e) { /* Already exists */ }
  db.run(`CREATE TABLE IF NOT EXISTS ping_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, device_id INTEGER NOT NULL, is_alive INTEGER NOT NULL,
    response_time REAL DEFAULT NULL, timestamp TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, device_id INTEGER NOT NULL, type TEXT NOT NULL,
    message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  const defaults = { 
    app_name:'PingMon', company_name:'My Company', company_address:'', company_phone:'', company_email:'', 
    ping_interval:'30', latency_threshold:'200', logo_path:'', alarm_sound:'1', max_log_days:'30' 
  };
  for (const [k,v] of Object.entries(defaults)) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [k, v]);
  }
  saveDb();
}

function getSettings() {
  const rows = dbAll('SELECT key, value FROM settings');
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  return s;
}
function getSetting(key) { return dbGet('SELECT value FROM settings WHERE key = ?', [key])?.value || null; }

// ============ API ROUTES ============

// Settings
app.get('/api/settings', (req, res) => res.json(getSettings()));

app.put('/api/settings', (req, res) => {
  try {
    for (const [k,v] of Object.entries(req.body)) db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    saveDb();
    res.json({ success: true, settings: getSettings() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings/logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const p = '/uploads/' + req.file.filename;
    dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['logo_path', p]);
    res.json({ success: true, logo_path: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings/alarm-file', upload.single('alarm'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const p = '/uploads/' + req.file.filename;
    dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['alarm_file_path', p]);
    res.json({ success: true, alarm_file_path: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings/restart-ping', (req, res) => { startPingEngine(); res.json({ success: true }); });

// Devices
app.get('/api/devices', (req, res) => res.json(dbAll('SELECT * FROM devices ORDER BY group_name, name')));

app.get('/api/devices/:id', (req, res) => {
  const d = dbGet('SELECT * FROM devices WHERE id = ?', [+req.params.id]);
  d ? res.json(d) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/devices', (req, res) => {
  const { name, ip_address, location, description, group_name } = req.body;
  if (!name || !ip_address) return res.status(400).json({ error: 'Name and IP required' });
  const r = dbRun('INSERT INTO devices (name, ip_address, location, description, group_name) VALUES (?, ?, ?, ?, ?)',
    [name, ip_address, location||'', description||'', group_name||'Default']);
  res.json(dbGet('SELECT * FROM devices WHERE id = ?', [r.lastInsertRowid]));
});

app.put('/api/devices/:id', (req, res) => {
  const { name, ip_address, location, description, group_name, is_active, is_muted } = req.body;
  dbRun(`UPDATE devices SET name=?, ip_address=?, location=?, description=?, group_name=?, is_active=?, is_muted=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [name, ip_address, location||'', description||'', group_name||'Default', is_active !== undefined ? +is_active : 1, is_muted !== undefined ? +is_muted : 0, +req.params.id]);
  res.json(dbGet('SELECT * FROM devices WHERE id = ?', [+req.params.id]));
});

app.put('/api/devices/:id/mute', (req, res) => {
  const { is_muted } = req.body;
  dbRun(`UPDATE devices SET is_muted = ? WHERE id = ?`, [+is_muted, +req.params.id]);
  res.json({ success: true });
});

app.delete('/api/devices/:id', (req, res) => {
  dbRun('DELETE FROM ping_logs WHERE device_id = ?', [+req.params.id]);
  dbRun('DELETE FROM alarms WHERE device_id = ?', [+req.params.id]);
  dbRun('DELETE FROM devices WHERE id = ?', [+req.params.id]);
  res.json({ success: true });
});

// Reports
app.get('/api/devices/:id/uptime', (req, res) => {
  const hours = req.query.hours || 24;
  const s = dbGet(`SELECT COUNT(*) as total_checks, SUM(CASE WHEN is_alive=1 THEN 1 ELSE 0 END) as up_checks,
    SUM(CASE WHEN is_alive=0 THEN 1 ELSE 0 END) as down_checks,
    AVG(CASE WHEN is_alive=1 THEN response_time END) as avg_response,
    MIN(CASE WHEN is_alive=1 THEN response_time END) as min_response,
    MAX(CASE WHEN is_alive=1 THEN response_time END) as max_response
    FROM ping_logs WHERE device_id = ? AND timestamp >= datetime('now','localtime',?)`,
    [+req.params.id, `-${hours} hours`]);
  const pct = s.total_checks > 0 ? ((s.up_checks / s.total_checks) * 100).toFixed(2) : 0;
  res.json({ ...s, uptime_percent: parseFloat(pct) });
});

app.get('/api/devices/:id/graph', (req, res) => {
  const hours = req.query.hours || 6;
  res.json(dbAll(`SELECT response_time, is_alive, timestamp FROM ping_logs WHERE device_id = ? AND timestamp >= datetime('now','localtime',?) ORDER BY timestamp ASC`,
    [+req.params.id, `-${hours} hours`]));
});

// Dashboard
app.get('/api/dashboard', (req, res) => {
  const devices = dbAll('SELECT * FROM devices WHERE is_active = 1 ORDER BY group_name, name');
  const recentAlarms = dbAll(`SELECT a.*, d.name as device_name, d.ip_address FROM alarms a JOIN devices d ON a.device_id = d.id ORDER BY a.created_at DESC LIMIT 20`);
  res.json({ 
    total: devices.length, 
    up: devices.filter(d => d.status === 'up').length, 
    down: devices.filter(d => d.status === 'down').length, 
    unknown: devices.filter(d => d.status === 'unknown').length, 
    devices, recentAlarms 
  });
});

// Alarms
app.get('/api/alarms', (req, res) => {
  const limit = req.query.limit || 50;
  const unreadOnly = req.query.unread_only === 'true';
  let q = `SELECT a.*, d.name as device_name, d.ip_address FROM alarms a JOIN devices d ON a.device_id = d.id`;
  if (unreadOnly) q += ' WHERE a.is_read = 0';
  q += ' ORDER BY a.created_at DESC LIMIT ?';
  const alarms = dbAll(q, [+limit]);
  const unread_count = dbGet(`
    SELECT COUNT(*) as c FROM alarms a 
    JOIN devices d ON a.device_id = d.id 
    WHERE a.is_read = 0 AND d.is_muted = 0
  `)?.c || 0;
  res.json({ alarms, unread_count });
});

app.put('/api/alarms/:id/read', (req, res) => { dbRun('UPDATE alarms SET is_read = 1 WHERE id = ?', [+req.params.id]); res.json({ success: true }); });
app.put('/api/alarms/read-all', (req, res) => { dbRun('UPDATE alarms SET is_read = 1'); res.json({ success: true }); });

// Manual Ping
app.post('/api/ping/:id', async (req, res) => {
  const device = dbGet('SELECT * FROM devices WHERE id = ?', [+req.params.id]);
  if (!device) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await ping.promise.probe(device.ip_address, { timeout: 5 });
    const rt = result.alive ? parseFloat(result.time) : null;
    dbRun('INSERT INTO ping_logs (device_id, is_alive, response_time) VALUES (?, ?, ?)', [device.id, result.alive?1:0, rt]);
    const prev = device.status, next = result.alive ? 'up' : 'down';
    dbRun(`UPDATE devices SET status=?, last_ping_ms=?, last_check=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`, [next, rt, device.id]);
    if (prev === 'up' && next === 'down') dbRun('INSERT INTO alarms (device_id, type, message) VALUES (?, ?, ?)', [device.id, 'down', `🔴 ${device.name} (${device.ip_address}) is DOWN!`]);
    else if (prev === 'down' && next === 'up') dbRun('INSERT INTO alarms (device_id, type, message) VALUES (?, ?, ?)', [device.id, 'up', `🟢 ${device.name} (${device.ip_address}) is back UP.`]);
    res.json({ alive: result.alive, time: rt, status: next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Backup & Restore
app.get('/api/backup', (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'DB file not found' });
  res.download(DB_PATH, `pingmon_backup_${new Date().toISOString().slice(0,10)}.db`);
});

app.post('/api/restore', upload.single('db'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const buf = fs.readFileSync(req.file.path);
    const newDb = new SQL.Database(buf);
    const check = newDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='devices'");
    if (!check.step()) { check.free(); return res.status(400).json({ error: 'Invalid database file' }); }
    check.free();
    db.close();
    db = newDb;
    saveDb();
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: 'Restored' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export CSV
app.get('/api/reports/export', (req, res) => {
  const hours = req.query.hours || 24;
  const did = req.query.device_id;
  let q = `SELECT d.name, d.ip_address, d.location, p.is_alive, p.response_time, p.timestamp FROM ping_logs p JOIN devices d ON p.device_id = d.id WHERE p.timestamp >= datetime('now','localtime',?)`;
  const params = [`-${hours} hours`];
  if (did) { q += ' AND p.device_id = ?'; params.push(+did); }
  q += ' ORDER BY p.timestamp DESC';
  const data = dbAll(q, params);
  let csv = 'Device Name,IP Address,Location,Status,Response Time (ms),Timestamp\n';
  data.forEach(r => csv += `"${r.name}","${r.ip_address}","${r.location}",${r.is_alive?'UP':'DOWN'},${r.response_time||'N/A'},${r.timestamp}\n`);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=pingmon_report.csv`);
  res.send(csv);
});

// ============ PING ENGINE ============
let pingTimer = null;

async function pingAllDevices() {
  try {
    const devices = dbAll('SELECT * FROM devices WHERE is_active = 1');
    for (const d of devices) {
      try {
        const result = await ping.promise.probe(d.ip_address, { timeout: 5 });
        const rt = result.alive ? parseFloat(result.time) : null;
        dbRun('INSERT INTO ping_logs (device_id, is_alive, response_time) VALUES (?, ?, ?)', [d.id, result.alive?1:0, rt]);
        const thresh = parseInt(getSetting('latency_threshold')) || 200;
        const prev = d.status, next = result.alive ? 'up' : 'down';
        const isWarning = next === 'up' && rt > thresh;
        const currentStatus = isWarning ? 'warning' : next;

        dbRun(`UPDATE devices SET status=?, last_ping_ms=?, last_check=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`, [next, rt, d.id]);

        if (prev !== 'unknown' && prev !== next) {
          const type = next === 'down' ? 'down' : 'up';
          const msg = next === 'down' ? `🔴 ${d.name} (${d.ip_address}) is DOWN!` : `🟢 ${d.name} (${d.ip_address}) is back UP.`;
          dbRun('INSERT INTO alarms (device_id, type, message) VALUES (?, ?, ?)', [d.id, type, msg]);
        }

        // Latency Warning Log
        if (next === 'up' && isWarning && d.status !== 'warning') {
          dbRun('INSERT INTO alarms (device_id, type, message) VALUES (?, ?, ?)', [d.id, 'warning', `⚠️ ${d.name} (${d.ip_address}) high latency: ${rt}ms`]);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function startPingEngine() {
  const sec = parseInt(getSetting('ping_interval')) || 30;
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(pingAllDevices, sec * 1000);
  pingAllDevices();
}

function cleanupOldLogs() {
  const days = parseInt(getSetting('max_log_days')) || 30;
  dbRun(`DELETE FROM ping_logs WHERE timestamp < datetime('now','localtime',?)`, [`-${days} days`]);
  dbRun(`DELETE FROM alarms WHERE created_at < datetime('now','localtime',?)`, [`-${days} days`]);
}

// Global Error Handler to catch Multer errors and others
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============ START ============
(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`\n🖥  PingMon running at http://localhost:${PORT}\n`);
    startPingEngine();
    setInterval(cleanupOldLogs, 6 * 60 * 60 * 1000);
  });
})();
