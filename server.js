'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { parseLog } = require('./lib/parser');
const { computeStats } = require('./lib/stats');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const FAVORITES_PATH = path.join(DATA_DIR, 'favorites.json');

const DEFAULT_LOG_DIR = path.join(
  process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'),
  'Balatro', 'Mods', 'lovely', 'log'
);

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) {}
  return {
    logDir: process.env.BALATRO_LOG_DIR || cfg.logDir || DEFAULT_LOG_DIR,
    port: Number(process.env.PORT || cfg.port || 4173),
  };
}
let CONFIG = loadConfig();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// User settings (log dir override, theme, custom colors). Stored separately
// from config.json so the UI can write them.
// ---------------------------------------------------------------------------
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch (_) { return {}; } }
function saveSettings(s) { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2)); }
let settings = loadSettings();
// Effective log directory: an explicitly-saved one wins over env/config/default.
const state = { logDir: settings.logDir || CONFIG.logDir };

function countLogs(dir) {
  try { return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.log')).length; }
  catch (_) { return null; }
}
function settingsResponse() {
  const c = countLogs(state.logDir);
  return {
    logDir: state.logDir,
    accessible: c !== null,
    logCount: c || 0,
    configured: settings.configured === true,
    theme: settings.theme || null,
    accent: settings.accent || null,
    enhColors: settings.enhColors || null,
    sealColors: settings.sealColors || null,
    panelColors: settings.panelColors || null,
  };
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------
function loadFavorites() {
  try { return new Set(JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8'))); }
  catch (_) { return new Set(); }
}
function saveFavorites(set) {
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify([...set], null, 2));
}
let favorites = loadFavorites();

// ---------------------------------------------------------------------------
// Parse cache (re-parse a file only when its mtime changes)
// ---------------------------------------------------------------------------
const cache = new Map(); // filename -> { mtimeMs, games }

function listLogFiles() {
  try {
    return fs.readdirSync(state.logDir)
      .filter((f) => f.toLowerCase().endsWith('.log'))
      .sort();
  } catch (_) { return null; } // null => directory not accessible
}

function getAllGames() {
  const files = listLogFiles();
  if (files === null) return { ok: false, games: [] };
  const all = [];
  for (const f of files) {
    const full = path.join(state.logDir, f);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    let entry = cache.get(f);
    if (!entry || entry.mtimeMs !== st.mtimeMs) {
      let games = [];
      try { games = parseLog(fs.readFileSync(full, 'utf8'), f); }
      catch (e) { console.error('parse error', f, e.message); }
      entry = { mtimeMs: st.mtimeMs, games };
      cache.set(f, entry);
    }
    for (const g of entry.games) all.push(g);
  }
  return { ok: true, games: all };
}

function summarize(g) {
  return {
    id: g.id, file: g.file, index: g.index, date: g.date,
    startTime: g.startTime, startEpoch: g.startEpoch, durationSec: g.durationSec,
    localName: g.localName, nemesisName: g.nemesisName, localRole: g.localRole, isHost: g.isHost,
    result: g.result, winner: g.winner,
    deckName: g.deckName, deckKey: g.deckKey,
    rulesetLabel: g.rulesetLabel, gamemodeLabel: g.gamemodeLabel,
    stake: g.stake, stakeInfo: g.stakeInfo,
    seed: g.seed, lobbyCode: g.lobbyCode,
    maxAnte: g.counters.maxAnte, pvpCount: g.pvpBlinds.length,
    handsPlayed: g.counters.handsPlayed,
    localJokerCount: g.local.jokers.length, nemesisJokerCount: g.nemesis.jokers.length,
    favorite: favorites.has(g.id),
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve({}); } });
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  try {
    if (pathname === '/api/config' || pathname === '/api/settings') {
      if (req.method === 'GET') return sendJson(res, 200, settingsResponse());
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (typeof body.logDir === 'string' && body.logDir.trim()) {
          settings.logDir = body.logDir.trim();
          state.logDir = settings.logDir;
          cache.clear();
        }
        for (const k of ['theme', 'accent', 'enhColors', 'sealColors', 'panelColors', 'configured']) {
          if (k in body) settings[k] = body[k];
        }
        saveSettings(settings);
        return sendJson(res, 200, settingsResponse());
      }
    }

    if (pathname === '/api/validate-dir' && req.method === 'GET') {
      const c = countLogs(query.path || '');
      return sendJson(res, 200, { accessible: c !== null, logCount: c || 0 });
    }

    if (pathname === '/api/stats' && req.method === 'GET') {
      const { games } = getAllGames();
      return sendJson(res, 200, computeStats(games));
    }

    if (pathname === '/api/games' && req.method === 'GET') {
      const { ok, games } = getAllGames();
      games.sort((a, b) => b.startEpoch - a.startEpoch);
      return sendJson(res, 200, { ok, logDir: state.logDir, count: games.length, games: games.map(summarize) });
    }

    if (pathname === '/api/game' && req.method === 'GET') {
      const { games } = getAllGames();
      const g = games.find((x) => x.id === query.id);
      if (!g) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { ...g, favorite: favorites.has(g.id) });
    }

    if (pathname === '/api/favorites') {
      if (req.method === 'GET') return sendJson(res, 200, { favorites: [...favorites] });
      const body = await readBody(req);
      const id = body.id || query.id;
      if (!id) return sendJson(res, 400, { error: 'id required' });
      if (req.method === 'POST') {
        if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
        saveFavorites(favorites);
        return sendJson(res, 200, { id, favorite: favorites.has(id) });
      }
      if (req.method === 'DELETE') {
        favorites.delete(id); saveFavorites(favorites);
        return sendJson(res, 200, { id, favorite: false });
      }
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'unknown endpoint' });

    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message });
  }
});

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

server.listen(CONFIG.port, () => {
  const link = `http://localhost:${CONFIG.port}`;
  const ok = listLogFiles() !== null;
  console.log('\n  Balatro Multiplayer Log Viewer');
  console.log('  ──────────────────────────────');
  console.log(`  Log directory : ${state.logDir}`);
  console.log(`  Accessible    : ${ok ? 'yes' : 'NO (check the path)'}`);
  console.log(`  Open in browser → ${link}`);
  console.log('\n  Keep this window open while using the app. Press Ctrl+C to stop.\n');
  openBrowser(link);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${CONFIG.port} is already in use.`);
    console.error(`  The viewer may already be running — just open http://localhost:${CONFIG.port}`);
    console.error(`  Or set a different port in config.json (e.g. {"port": 4180}).\n`);
  } else { console.error(e); }
  process.exit(1);
});
