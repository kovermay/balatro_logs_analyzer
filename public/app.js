'use strict';
/* ===========================================================================
 *  Balatro Multiplayer — Log Viewer (frontend SPA)
 * ======================================================================== */

const App = {
  games: [],
  favorites: new Set(),
  config: {},
  settings: null,
  loaded: false,
  detailCache: {},
  // list UI state
  ui: { q: '', result: 'all', deck: 'all', sort: 'new' },
};

// ----------------------------- lookups ------------------------------------
const SUIT_SYM = { S: '♠', H: '♥', C: '♣', D: '♦' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
const RANKS = { A: 'A', K: 'K', Q: 'Q', J: 'J', T: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const DEFAULT_SEAL = { Red: '#e35646', Blue: '#4c8fbd', Gold: '#e0b13c', Purple: '#7d5bbe' };
const DEFAULT_ENH = { m_mult: '#e8554a', m_bonus: '#4ca7ea', m_wild: '#ff9f6e', m_glass: '#bbe3f5', m_steel: '#9aa2b3', m_gold: '#e0b13c', m_stone: '#737a86', m_lucky: '#5ed18c' };
const ENH_NAME = { m_bonus: 'Bonus', m_mult: 'Mult', m_wild: 'Wild', m_glass: 'Glass', m_steel: 'Steel', m_stone: 'Stone', m_gold: 'Gold', m_lucky: 'Lucky' };
const SEAL_LIST = ['Red', 'Blue', 'Gold', 'Purple'];
const ENH_LIST = ['m_mult', 'm_bonus', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_stone', 'm_lucky'];
const DEFAULT_ACCENT = '#fe5f55';
const DEFAULT_THEME = 'balatro';
const THEMES = {
  balatro: { name: 'Balatro Dark', vars: { '--bg': '#14161d', '--bg-2': '#191c25', '--panel': '#20242f', '--panel-2': '#262b38', '--panel-3': '#2e3442', '--line': '#333a4a', '--text': '#e9edf5', '--muted': '#8a92a6', '--muted-2': '#6b7387', '--green': '#4bc48a' } },
  midnight: { name: 'Midnight', vars: { '--bg': '#0c1018', '--bg-2': '#10151f', '--panel': '#151b29', '--panel-2': '#1a2233', '--panel-3': '#222c41', '--line': '#2a3550', '--text': '#e6ecf7', '--muted': '#7e89a6', '--muted-2': '#5d6680', '--green': '#46c79a' } },
  carbon: { name: 'Carbon', vars: { '--bg': '#16181a', '--bg-2': '#1b1e21', '--panel': '#212427', '--panel-2': '#282c30', '--panel-3': '#31363b', '--line': '#3a4046', '--text': '#eceef0', '--muted': '#9aa0a6', '--muted-2': '#71777d', '--green': '#52c98e' } },
  light: { name: 'Daylight', vars: { '--bg': '#eef1f6', '--bg-2': '#e7ebf2', '--panel': '#ffffff', '--panel-2': '#f4f6fa', '--panel-3': '#e9edf4', '--line': '#d6dbe5', '--text': '#1b2230', '--muted': '#5b6680', '--muted-2': '#8a93a6', '--green': '#1f9d63' } },
};
function getEnhColors() { return Object.assign({}, DEFAULT_ENH, (App.settings && App.settings.enhColors) || {}); }
function getSealColors() { return Object.assign({}, DEFAULT_SEAL, (App.settings && App.settings.sealColors) || {}); }
function sealCol(k) { return getSealColors()[k] || '#aaa'; }
function enhCol(k) { return getEnhColors()[k] || '#888'; }
// hex helpers
function hex2rgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(h, pct) { const [r, g, b] = hex2rgb(h); const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * (pct > 0 ? 255 - v : v)))); return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join(''); }
function lum(h) { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function inkFor(h) { return lum(h) > 0.6 ? '#1c2230' : '#fff'; }
const EDITION_LABEL = { foil: 'Foil', holo: 'Holo', polychrome: 'Poly', negative: 'Neg' };
const EVENT_ICON = {
  'money-up': '＋', 'money-down': '－', move: '→', use: '✦', buy: '🛒', sell: '↩',
  reroll: '⟳', report: '🧾', skip: '⏭', win: '🏆', lose: '☠', 'pvp-start': '⚔',
  'pvp-win': '🏆', 'pvp-loss': '☠',
};

// ----------------------------- helpers ------------------------------------
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtNum(v) {
  if (v == null) return '0';
  let s = String(v);
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  s = s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '') || '0';
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + s;
}
function bigDiff(a, b) {
  try { const d = BigInt(String(a).replace(/\D/g, '') || 0) - BigInt(String(b).replace(/\D/g, '') || 0); return d < 0n ? '-' + fmtNum((-d).toString()) : fmtNum(d.toString()); }
  catch (_) { return '0'; }
}
function bigSum(arr) {
  let t = 0n; for (const x of arr) { try { t += BigInt(String(x).replace(/\D/g, '') || 0); } catch (_) {} } return t.toString();
}
function fmtCompact(n) {
  n = Number(n); if (!isFinite(n)) return '∞';
  const u = [['', 1], ['K', 1e3], ['M', 1e6], ['B', 1e9], ['T', 1e12], ['Q', 1e15], ['e18', 1e18]];
  let i = 0; while (i < u.length - 1 && n >= u[i + 1][1]) i++;
  return (n / u[i][1]).toFixed(n >= u[i][1] * 10 || i === 0 ? 0 : 1) + u[i][0];
}
function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m ? `${m}m ${s}s` : `${s}s`;
}
function fmtDate(d) {
  if (!d) return '';
  const [y, mo, da] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[+mo - 1]} ${+da}, ${y}`;
}
function baseName(n) { return String(n || '').replace(/~\d+$/, ''); }
// Deck back sprite key. deckKey usually arrives as a pretty name ("Red Deck"),
// while sprites are filed under the internal key ("b_red"); derive it.
const MP_DECK_KEYS = { cocktail: 'b_mp_cocktail', violet: 'b_mp_violet', orange: 'b_mp_orange' };
function deckSpriteKey(g) {
  const raw = (g && (g.deckKey || g.deckName)) || '';
  if (!raw) return null;
  if (/^b_/.test(raw)) return raw; // already an internal key (incl. b_mp_*)
  const base = String(raw).replace(/\s*Deck$/i, '').trim().toLowerCase().replace(/\s+/g, '_');
  return MP_DECK_KEYS[base] || ('b_' + base);
}
function hashHue(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
function monogram(name) {
  const parts = String(name).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

// ----------------------------- data ---------------------------------------
async function api(path, opts) { const r = await fetch(path, opts); return r.json(); }

function mergeSettings(s) {
  App.settings = {
    configured: !!s.configured,
    theme: s.theme || DEFAULT_THEME,
    accent: s.accent || DEFAULT_ACCENT,
    enhColors: Object.assign({}, DEFAULT_ENH, s.enhColors || {}),
    sealColors: Object.assign({}, DEFAULT_SEAL, s.sealColors || {}),
    logDir: s.logDir, accessible: s.accessible, logCount: s.logCount,
  };
}
function applySettings() {
  const s = App.settings; if (!s) return;
  const root = document.documentElement;
  const t = THEMES[s.theme] || THEMES[DEFAULT_THEME];
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.style.setProperty('--accent', s.accent);
  document.body.dataset.theme = s.theme;
}
async function loadSettings() { mergeSettings(await api('/api/settings')); }
async function saveSettings(patch) {
  const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  mergeSettings(r); applySettings(); return App.settings;
}
async function loadGames() {
  const games = await api('/api/games');
  App.games = games.games || [];
  App.favorites = new Set(App.games.filter((g) => g.favorite).map((g) => g.id));
  App.detailCache = {};
  $('#game-count').textContent = `${App.games.length} games`;
  $('#logdir').innerHTML = App.settings.accessible
    ? `Reading logs from <span class="mono">${esc(App.settings.logDir)}</span>`
    : `<span style="color:var(--red)">Log folder not found:</span> <span class="mono">${esc(App.settings.logDir)}</span>`;
}
async function getGame(id) {
  if (App.detailCache[id]) return App.detailCache[id];
  const g = await api('/api/game?id=' + encodeURIComponent(id));
  App.detailCache[id] = g; return g;
}
async function toggleFav(id) {
  const r = await api('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (r.favorite) App.favorites.add(id); else App.favorites.delete(id);
  const g = App.games.find((x) => x.id === id); if (g) g.favorite = r.favorite;
  if (App.detailCache[id]) App.detailCache[id].favorite = r.favorite;
  toast(r.favorite ? '★ Added to favorites' : 'Removed from favorites');
  return r.favorite;
}

// ----------------------------- components ---------------------------------
function resultBadge(r) {
  const label = r === 'win' ? 'Win' : r === 'loss' ? 'Loss' : 'Unfinished';
  return `<span class="result-badge ${r}">${label}</span>`;
}
function stakePip(s) {
  if (!s) return '';
  const color = (s.name || '').split(' ')[0].toLowerCase();
  return `<img class="stake-img" src="assets/sprites/stickers/stake_${esc(color)}.png" alt="${esc(s.name)}" title="${esc(s.name)}" onerror="this.outerHTML='<span class=stake-pip style=background:${esc(s.color)}></span>'">`;
}

function gameCard(s) {
  const fav = App.favorites.has(s.id);
  const winnerIsYou = s.result === 'win';
  const crown = '<span class="crown">♛</span>';
  return `
  <div class="gcard ${s.result}" data-id="${esc(s.id)}">
    <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${esc(s.id)}" title="Toggle favorite">${fav ? '★' : '☆'}</button>
    <div class="gcard-top">
      <div class="matchup">
        <span class="you">${winnerIsYou ? crown : ''}${esc(s.localName)}</span>
        <span class="vs">vs</span>
        <span class="opp">${!winnerIsYou && s.result === 'loss' ? crown : ''}${esc(s.nemesisName)}</span>
      </div>
    </div>
    ${resultBadge(s.result)}
    <div class="gcard-meta">
      <span class="chip role-${(s.localRole || '').toLowerCase()}">${esc(s.localRole)}</span>
      <span class="chip">${esc(s.deckName)}</span>
      ${s.stakeInfo ? `<span class="chip">${stakePip(s.stakeInfo)}${esc(s.stakeInfo.name.replace(' Stake', ''))}</span>` : ''}
      ${s.rulesetLabel ? `<span class="chip">${esc(s.rulesetLabel)}</span>` : ''}
      ${s.pvpCount ? `<span class="chip">⚔ ${s.pvpCount} blinds</span>` : ''}
    </div>
    <div class="gcard-foot">
      <span>${fmtDate(s.date)} · ${esc(s.startTime)} · ${fmtDuration(s.durationSec)}</span>
      <span class="file">${esc(s.seed || '')}</span>
    </div>
  </div>`;
}

function playingCard(c) {
  const cls = ['pcard', 'suit-' + c.suit];
  if (c.edition) cls.push('ed-' + c.edition);
  let style = '';
  if (c.enhancement) {
    const col = enhCol(c.enhancement);
    // gradient is only a fallback for when the texture sprite fails to load;
    // keep the suit-coloured pips (outlined in CSS) so they read on any texture.
    style = ` style="background:linear-gradient(150deg,${shade(col, 16)},${shade(col, -18)})"`;
  }
  const sealKey = c.seal ? c.seal.toLowerCase() : null;
  const seal = sealKey
    ? `<img class="seal-img" src="assets/sprites/seals/${esc(sealKey)}.png" alt="${esc(c.seal)} Seal" title="${esc(c.seal)} Seal" onerror="this.outerHTML='<span class=seal style=background:${sealCol(c.seal)}></span>'">`
    : '';
  // Enhancement art is a full-card texture (steel/gold/glass/stone…); fill the
  // whole card with it. The CSS gradient stays as a fallback if it fails to load.
  const enhFill = c.enhancement
    ? `<img class="enh-fill" src="assets/sprites/enhancements/${esc(c.enhancement)}.png" alt="${esc(ENH_NAME[c.enhancement] || c.enhancement)}" onerror="this.remove()">`
    : '';
  // Real card-face sprite (rank pips + figures) layered over the card body.
  // Stone cards are intentionally blank. On load it hides the font fallback;
  // on error the rank/suit text shows instead.
  const showFace = c.suit && c.rank && c.enhancement !== 'm_stone';
  const face = showFace
    ? `<img class="card-face" src="assets/sprites/cards/${esc(c.suit)}_${esc(c.rank)}.png" alt="" loading="lazy" onload="this.closest('.pcard').classList.add('has-face')" onerror="this.remove()">`
    : '';
  const fontFallback = c.enhancement === 'm_stone' ? ''
    : `<span class="r">${RANKS[c.rank] || c.rank}</span><span class="s">${SUIT_SYM[c.suit]}</span>`;
  const title = [RANKS[c.rank] + ' of ' + SUIT_NAME[c.suit],
    c.enhancement ? ENH_NAME[c.enhancement] : null,
    c.edition ? EDITION_LABEL[c.edition] : null,
    c.seal ? c.seal + ' Seal' : null].filter(Boolean).join(' · ');
  return `<div class="${cls.join(' ')}"${style} title="${esc(title)}">${enhFill}${face}${seal}${fontFallback}</div>`;
}

function deckView(cards) {
  let html = '<div class="deck-view">';
  for (const suit of ['S', 'H', 'C', 'D']) {
    const inSuit = cards.filter((c) => c.suit === suit)
      .sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
    if (!inSuit.length) continue;
    html += `<div class="suit-row"><span class="suit-label" style="color:${suit === 'H' || suit === 'D' ? 'var(--red)' : 'var(--text)'}">${SUIT_SYM[suit]}</span><div class="cards-wrap">${inSuit.map(playingCard).join('')}</div></div>`;
  }
  return html + '</div>';
}

const STICKER_SPRITE = { eternal: 'eternal', perishable: 'perishable', rental: 'rental' };
function jokerCard(j) {
  const cls = ['joker'];
  const isMp = j.key.startsWith('j_mp_');
  if (isMp) cls.push('mp');
  if (j.edition) cls.push('ed-' + j.edition);
  const hue = hashHue(j.key);
  const edTag = j.edition ? `<span class="edition-tag ${j.edition}">${EDITION_LABEL[j.edition]}</span>` : '';
  const stickIcons = (j.stickers || []).map((s) => {
    const k = STICKER_SPRITE[s.toLowerCase()];
    return k
      ? `<img class="joker-sticker" src="assets/sprites/stickers/${esc(k)}.png" alt="${esc(s)}" title="${esc(s)}" onerror="this.outerHTML='<span class=sticker-tag>${esc(s)}</span>'">`
      : `<span class="sticker-tag">${esc(s)}</span>`;
  }).join('');
  // Multiplayer re-implements some vanilla jokers (j_mp_bloodstone …). They have
  // no dedicated sprite, so fall back to the vanilla art by stripping the mp_ tag.
  const spriteKey = isMp ? 'j_' + j.key.slice('j_mp_'.length) : j.key;
  const spritePath = `assets/sprites/jokers/${esc(spriteKey)}.png`;
  return `<div class="${cls.join(' ')}" title="${esc(j.name)}${j.edition ? ' (' + EDITION_LABEL[j.edition] + ')' : ''}">
    ${isMp ? '<span class="jmp">MP</span>' : ''}
    <div class="jart" style="background:linear-gradient(160deg,hsl(${hue} 48% 34%),hsl(${hue} 50% 17%))">${spritePath ? `<img class="jsprite" src="${spritePath}" alt="" loading="lazy" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">` : ''}<span class="jmono">${esc(monogram(j.name))}</span></div>
    <div class="jname">${esc(j.name)}</div>${edTag}${stickIcons}
  </div>`;
}
// style for monogram + sprite (injected once)
const _styleMono = document.createElement('style');
_styleMono.textContent = '.jmono{font-weight:800;font-size:24px;color:rgba(255,255,255,.92);text-shadow:0 2px 4px rgba(0,0,0,.4)}.jsprite{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1}.jart.has-img{background:#181c26 !important}.jart.has-img .jmono{display:none}';
document.head.appendChild(_styleMono);

function voucherChip(v) {
  const img = v.key ? `<img class="voucher-img" src="assets/sprites/vouchers/${esc(v.key)}.png" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="voucher">${img}<span class="voucher-name">${esc(v.name)}</span></span>`;
}

// ----------------------------- list view ----------------------------------
function renderList(favoritesOnly) {
  setActive(favoritesOnly ? 'favorites' : 'games');
  let games = App.games.slice();
  if (favoritesOnly) games = games.filter((g) => App.favorites.has(g.id));

  const decks = [...new Set(App.games.map((g) => g.deckName))].sort();
  const u = App.ui;

  const app = $('#app');
  app.innerHTML = `
    <div class="page-head"><h1>${favoritesOnly ? '★ Favorites' : 'All Games'}</h1>
      <span class="muted" id="list-count"></span></div>
    <div class="toolbar">
      <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="q" placeholder="Search player, deck, seed, lobby…" value="${esc(u.q)}"/></label>
      <select class="pill" id="f-result">
        <option value="all">All results</option><option value="win">Wins</option>
        <option value="loss">Losses</option><option value="unknown">Unfinished</option></select>
      <select class="pill" id="f-deck"><option value="all">All decks</option>
        ${decks.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select>
      <select class="pill" id="f-sort">
        <option value="new">Newest first</option><option value="old">Oldest first</option>
        <option value="long">Longest</option><option value="pvp">Most PVP blinds</option></select>
    </div>
    <div class="grid" id="grid"></div>`;

  $('#f-result').value = u.result; $('#f-deck').value = u.deck; $('#f-sort').value = u.sort;
  const apply = () => {
    u.q = $('#q').value; u.result = $('#f-result').value; u.deck = $('#f-deck').value; u.sort = $('#f-sort').value;
    drawGrid(games);
  };
  $('#q').addEventListener('input', apply);
  ['f-result', 'f-deck', 'f-sort'].forEach((id) => $('#' + id).addEventListener('change', apply));
  drawGrid(games);
}

function drawGrid(games) {
  const u = App.ui;
  let list = games.filter((g) => {
    if (u.result !== 'all' && g.result !== u.result) return false;
    if (u.deck !== 'all' && g.deckName !== u.deck) return false;
    if (u.q) {
      const q = u.q.toLowerCase();
      const hay = [g.localName, g.nemesisName, g.deckName, g.seed, g.lobbyCode, g.rulesetLabel, g.file].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorters = {
    new: (a, b) => b.startEpoch - a.startEpoch,
    old: (a, b) => a.startEpoch - b.startEpoch,
    long: (a, b) => b.durationSec - a.durationSec,
    pvp: (a, b) => b.pvpCount - a.pvpCount,
  };
  list.sort(sorters[u.sort] || sorters.new);
  $('#list-count').textContent = `${list.length} shown`;
  const grid = $('#grid');
  if (!grid) return;
  if (!list.length) {
    const favEmpty = location.hash.startsWith('#/favorites') && !App.favorites.size;
    grid.innerHTML = favEmpty
      ? `<div class="empty"><div class="big">★</div>No favorites yet.<br><span class="muted">Tap the star on any game to save it here.</span></div>`
      : `<div class="empty"><div class="big">♠</div>No games match your filters.</div>`;
    return;
  }
  grid.innerHTML = list.map(gameCard).join('');
}

// ----------------------------- detail view --------------------------------
async function renderDetail(id) {
  setActive(null);
  const app = $('#app');
  app.innerHTML = `<div class="loading">Loading game…</div>`;
  let g;
  try { g = await getGame(id); } catch (e) { app.innerHTML = `<div class="empty">Could not load game.</div>`; return; }
  if (g.error) { app.innerHTML = `<div class="empty">Game not found.</div>`; return; }

  const fav = App.favorites.has(id);
  const winYou = g.result === 'win';

  app.innerHTML = `
    <div class="page-head">
      <button class="back-btn" id="back">← Back</button>
      <div>
        <div class="detail-title">
          <h1>${esc(g.localName)} <span class="muted" style="font-weight:600">vs</span> ${esc(g.nemesisName)}</h1>
          ${resultBadge(g.result)}
        </div>
        <div class="detail-sub">${fmtDate(g.date)} · ${esc(g.startTime)} · ${fmtDuration(g.durationSec)} · <span class="mono">${esc(g.file)}</span></div>
      </div>
      <button class="detail-fav ${fav ? 'on' : ''}" id="favtoggle">${fav ? '★ Favorited' : '☆ Add favorite'}</button>
    </div>
    ${detailsPanel(g)}
    ${deckPanel(g)}
    ${jokersPanel(g)}
    ${vouchersPanel(g)}
    ${economyPanel(g)}
    ${shopPanel(g)}
    ${pvpPanel(g)}
    ${eventsPanel(g)}
  `;

  $('#back').addEventListener('click', () => { history.length > 1 ? history.back() : (location.hash = '#/games'); });
  $('#favtoggle').addEventListener('click', async (e) => {
    const on = await toggleFav(id);
    e.target.classList.toggle('on', on);
    e.target.textContent = on ? '★ Favorited' : '☆ Add favorite';
  });
  wireDeckToggles();
  wireEventFilters();
  wireEconomy();
}

function kv(k, v, cls) { return `<div class="kv"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span></div>`; }
function flag(b) { return b ? '<span class="flag-yes">Yes</span>' : '<span class="flag-no">No</span>'; }

function detailsPanel(g) {
  const o = g.options || {};
  const winner = g.winner ? `${esc(g.winner)} ${g.winner === g.localName ? '<span class="tag-you">You</span>' : ''}` : '—';
  return `<div class="panel"><h2><span class="accent"></span>Game Details</h2>
    <div class="kv-grid">
      ${kv('Your Role', `<span class="chip role-${(g.localRole || '').toLowerCase()}">${esc(g.localRole)}</span> ${esc(g.localName)}`)}
      ${kv('Winner', winner)}
      ${kv('Deck', (deckSpriteKey(g) ? `<img class="deck-img" src="assets/sprites/backs/${esc(deckSpriteKey(g))}.png" alt="" onerror="this.remove()"> ` : '') + esc(g.deckName), 'with-icon')}
      ${kv('Stake', g.stakeInfo ? stakePip(g.stakeInfo) + ' ' + esc(g.stakeInfo.name) : '—')}
      ${kv('Ruleset', esc(g.rulesetLabel || '—'))}
      ${kv('Game Mode', esc(g.gamemodeLabel || '—'))}
      ${kv('Seed', esc(g.seed || '—'), 'mono')}
      ${kv('Lobby Code', esc(g.lobbyCode || '—'), 'mono')}
      ${kv(esc(g.localName) + ' Rerolls', `${g.local.rerollCount} <span class="muted">($${g.local.rerollCost})</span>`)}
      ${kv(esc(g.nemesisName) + ' Rerolls', `${g.nemesis.rerollCount} <span class="muted">($${g.nemesis.rerollCost})</span>`)}
      ${kv('Different Decks', flag(o.different_decks))}
      ${kv('Different Seeds', flag(o.different_seeds))}
      ${kv('Death on Round Loss', flag(o.death_on_round_loss))}
      ${kv('Gold on Life Loss', flag(o.gold_on_life_loss))}
      ${kv('No Gold on Round Loss', flag(o.no_gold_on_round_loss))}
      ${o.starting_lives != null ? kv('Starting Lives', o.starting_lives) : ''}
      ${o.pvp_start_round != null ? kv('PVP Start Round', o.pvp_start_round) : ''}
    </div></div>`;
}

function playerSnapshot(g, side) {
  const p = g[side === 'you' ? 'local' : 'nemesis'];
  const name = side === 'you' ? g.localName : g.nemesisName;
  const isWinner = g.winner === name;
  const st = p.deckStats || { count: 0, modified: 0, enhanced: 0, editions: 0, seals: 0 };
  const did = `deck-${side}`;
  return `<div>
    <div class="player-head">
      <span class="player-name">${esc(name)} ${isWinner ? '<span class="tag-winner">Winner</span>' : ''} ${side === 'you' ? '<span class="tag-you">You</span>' : ''}</span>
    </div>
    <div class="statline">
      <div class="stat-chip"><div class="n">${st.count}</div><div class="l">Cards</div></div>
      <div class="stat-chip"><div class="n">${st.modified}</div><div class="l">Modified</div></div>
      <div class="stat-chip"><div class="n">${st.enhanced}</div><div class="l">Enhanced</div></div>
      <div class="stat-chip"><div class="n">${st.editions}</div><div class="l">Editions</div></div>
      <div class="stat-chip"><div class="n">${st.seals}</div><div class="l">Seals</div></div>
    </div>
    ${p.deck && p.deck.length ? `<button class="linkbtn" style="margin-top:12px" data-deck-toggle="${did}">View deck ▾</button>
      <div id="${did}" style="display:none">${deckView(p.deck)}</div>` : '<div class="muted" style="margin-top:12px">No deck snapshot</div>'}
  </div>`;
}
function deckPanel(g) {
  return `<div class="panel"><h2><span class="accent"></span>Deck Snapshots</h2>
    <div class="two-col">${playerSnapshot(g, 'you')}${playerSnapshot(g, 'nemesis')}</div></div>`;
}
function wireDeckToggles() {
  $$('[data-deck-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const t = $('#' + btn.dataset.deckToggle);
    const open = t.style.display === 'none';
    t.style.display = open ? 'block' : 'none';
    btn.textContent = open ? 'Hide deck ▴' : 'View deck ▾';
  }));
}

function jokersPanel(g) {
  const col = (p, name, isWin, you) => `<div>
    <div class="player-head"><span class="player-name">${esc(name)} ${isWin ? '<span class="tag-winner">Winner</span>' : ''} ${you ? '<span class="tag-you">You</span>' : ''}</span>${p.jokers.length ? `<span class="joker-count">${p.jokers.length}</span>` : ''}</div>
    ${p.jokers.length ? `<div class="joker-row">${p.jokers.map(jokerCard).join('')}</div>` : '<div class="muted">No jokers recorded</div>'}</div>`;
  return `<div class="panel"><h2><span class="accent"></span>Final Jokers</h2>
    <div class="two-col">
      ${col(g.local, g.localName, g.winner === g.localName, true)}
      ${col(g.nemesis, g.nemesisName, g.winner === g.nemesisName, false)}
    </div></div>`;
}

function vouchersPanel(g) {
  if (!g.local.vouchers.length && !g.nemesis.vouchers.length) return '';
  const col = (p, name) => `<div>
    <div class="player-head"><span class="player-name">${esc(name)}</span></div>
    ${p.vouchers.length ? `<div class="voucher-row">${p.vouchers.map(voucherChip).join('')}</div>` : '<div class="muted">None</div>'}</div>`;
  return `<div class="panel"><h2><span class="accent"></span>Vouchers</h2>
    <div class="two-col">${col(g.local, g.localName)}${col(g.nemesis, g.nemesisName)}</div></div>`;
}

function shopPanel(g) {
  const n = Math.max(g.localShops.length, g.nemesisShops.length);
  if (!n) return '';
  let rows = '';
  for (let i = 0; i < n; i++) {
    const a = g.localShops[i], b = g.nemesisShops[i];
    rows += `<tr><td>${i + 1}</td><td class="num">${a != null ? '$' + a : '—'}</td><td class="num">${b != null ? '$' + b : '—'}</td></tr>`;
  }
  const ta = g.localShops.reduce((s, x) => s + x, 0), tb = g.nemesisShops.reduce((s, x) => s + x, 0);
  return `<div class="panel"><h2><span class="accent"></span>Shop Spending</h2>
    <table class="tbl"><thead><tr><th>Shop</th><th class="col-you">${esc(g.localName)}</th><th class="col-opp">${esc(g.nemesisName)}</th></tr></thead>
    <tbody>${rows}<tr class="total"><td>Total</td><td class="num">$${ta}</td><td class="num">$${tb}</td></tr></tbody></table></div>`;
}

// diverging economy timeline: you spend up, opponent down, parity in the centre
function economyPanel(g) {
  const eco = g.economy || [];
  if (!eco.length) return '';
  const et = g.economyTotals || { you: 0, opp: 0, diff: 0 };
  const maxVal = Math.max(1, ...eco.flatMap((e) => [e.you || 0, e.opp || 0]));
  const n = eco.length;
  const H = 312, center = 168, half = 120, colW = 44, gap = 9, leftPad = 6;
  const innerW = Math.max(n * colW + leftPad * 2, 480);

  let bands = '', bars = '', xlabels = '', hits = '', anteSep = '';
  let lastAnte = null;
  eco.forEach((e, i) => {
    const x = leftPad + i * colW;
    const cx = x + colW / 2;
    const bw = colW - gap;
    const youH = Math.round((e.you || 0) / maxVal * half);
    const oppH = Math.round((e.opp || 0) / maxVal * half);
    if (e.pvp) {
      bands += `<rect x="${x}" y="22" width="${colW}" height="${H - 52}" class="eco-pvp-band"/>`;
      bands += `<text x="${cx}" y="16" class="eco-pvp-ico">⚔</text>`;
    }
    if (e.ante != null && e.ante !== lastAnte) {
      if (lastAnte !== null) anteSep += `<line x1="${x}" y1="24" x2="${x}" y2="${H - 28}" class="eco-ante-sep"/>`;
      anteSep += `<text x="${cx}" y="${H - 4}" class="eco-ante-lab">A${e.ante}</text>`;
      lastAnte = e.ante;
    }
    bars += `<rect x="${cx - bw / 2}" y="${center - youH}" width="${bw}" height="${youH}" rx="3" class="eco-you"/>`;
    bars += `<rect x="${cx - bw / 2}" y="${center}" width="${bw}" height="${oppH}" rx="3" class="eco-opp"/>`;
    xlabels += `<text x="${cx}" y="${center + half + 22}" class="eco-xlab">${e.shop}</text>`;
    hits += `<rect x="${x}" y="0" width="${colW}" height="${H}" fill="transparent" class="eco-hit"
      data-shop="${e.shop}" data-you="${e.you == null ? '' : e.you}" data-opp="${e.opp == null ? '' : e.opp}" data-pvp="${e.pvp ? 1 : 0}" data-ante="${e.ante == null ? '' : e.ante}" data-cx="${cx}"/>`;
  });
  const axis = `<line x1="0" y1="${center}" x2="${innerW}" y2="${center}" class="eco-axis"/>`;
  const cursor = `<line id="eco-cursor" x1="0" y1="22" x2="0" y2="${H - 28}" class="eco-cursor" style="display:none"/>`;
  const youName = esc(g.localName), oppName = esc(g.nemesisName);
  const lead = et.diff === 0 ? 'Dead even' : et.diff > 0
    ? `${youName} spent <b style="color:var(--blue)">$${fmtNum(et.diff)}</b> more`
    : `${oppName} spent <b style="color:var(--red)">$${fmtNum(-et.diff)}</b> more`;

  return `<div class="panel"><h2><span class="accent"></span>Economy Timeline</h2>
    <div class="eco-head">
      <span class="eco-tot"><span class="dotc" style="background:var(--blue)"></span>${youName} <b>$${fmtNum(et.you)}</b></span>
      <span class="muted">${lead}</span>
      <span class="eco-tot">${oppName} <b>$${fmtNum(et.opp)}</b><span class="dotc" style="background:var(--red);margin:0 0 0 6px"></span></span>
    </div>
    <div class="eco-body" id="eco-body" data-youname="${youName}" data-oppname="${oppName}">
      <div class="eco-scroll" id="eco-scroll">
        <svg width="${innerW}" height="${H}" class="eco-svg">
          ${bands}${anteSep}${axis}${bars}${xlabels}${cursor}${hits}
        </svg>
      </div>
      <div class="eco-tip" id="eco-tip"></div>
    </div>
    <div class="eco-legend"><span><i class="sw-you"></i>${youName} (spend ▲)</span><span><i class="sw-opp"></i>${oppName} (spend ▼)</span><span><i class="sw-pvp"></i>PVP blind</span><span class="muted">centre line = parity</span></div>
  </div>`;
}
function wireEconomy() {
  const body = $('#eco-body'); if (!body) return;
  const scroll = $('#eco-scroll'), tip = $('#eco-tip'), cursor = $('#eco-cursor');
  const youName = body.dataset.youname, oppName = body.dataset.oppname;
  scroll.addEventListener('mousemove', (ev) => {
    const hit = ev.target.closest && ev.target.closest('.eco-hit');
    if (!hit) { tip.style.display = 'none'; if (cursor) cursor.style.display = 'none'; return; }
    const d = hit.dataset;
    const you = d.you === '' ? null : +d.you, opp = d.opp === '' ? null : +d.opp;
    const diff = (you || 0) - (opp || 0);
    const diffTxt = you == null || opp == null ? '' : diff === 0 ? '<span class="muted">even this shop</span>'
      : diff > 0 ? `<span style="color:var(--blue)">${esc(youName)} +$${fmtNum(diff)}</span>`
      : `<span style="color:var(--red)">${esc(oppName)} +$${fmtNum(-diff)}</span>`;
    tip.innerHTML = `<div class="eco-tip-h">Shop ${d.shop}${d.ante ? ` · Ante ${d.ante}` : ''}${d.pvp === '1' ? ' · <span class="eco-tip-pvp">⚔ PVP</span>' : ''}</div>
      <div class="eco-tip-row"><span class="col-you">${esc(youName)}</span><b>${you == null ? '—' : '$' + you}</b></div>
      <div class="eco-tip-row"><span class="col-opp">${esc(oppName)}</span><b>${opp == null ? '—' : '$' + opp}</b></div>
      <div class="eco-tip-diff">${diffTxt}</div>`;
    tip.style.display = 'block';
    if (cursor) { cursor.setAttribute('x1', d.cx); cursor.setAttribute('x2', d.cx); cursor.style.display = 'block'; }
    const bodyRect = body.getBoundingClientRect();
    let left = ev.clientX - bodyRect.left;
    left = Math.max(64, Math.min(bodyRect.width - 64, left));
    tip.style.left = left + 'px';
  });
  scroll.addEventListener('mouseleave', () => { tip.style.display = 'none'; if (cursor) cursor.style.display = 'none'; });
}

function pvpPanel(g) {
  if (!g.pvpBlinds.length) return '';
  const lt = bigSum(g.pvpBlinds.map((b) => b.localScore));
  const nt = bigSum(g.pvpBlinds.map((b) => b.nemesisScore));
  const rows = g.pvpBlinds.map((b) => {
    const icon = b.result === 'win' ? '<span class="blind-icon" title="Won">🏆</span>'
      : b.result === 'loss' ? '<span class="blind-icon" title="Lost">☠</span>' : '';
    return `<tr><td>${icon} Blind ${b.index}</td>
      <td class="num ${b.result === 'win' ? 'win-cell' : ''}">${fmtNum(b.localScore)}</td>
      <td class="num ${b.result === 'loss' ? 'win-cell' : ''}">${fmtNum(b.nemesisScore)}</td></tr>`;
  }).join('');
  const youWonTotal = (() => { try { return BigInt(lt) >= BigInt(nt); } catch (_) { return false; } })();

  const detail = g.pvpBlinds.map((b) => {
    const maxHands = Math.max(b.localHands.length, b.nemesisHands.length);
    if (!maxHands) return '';
    let hrows = '';
    for (let i = 0; i < maxHands; i++) {
      hrows += `<tr><td>Hand ${i + 1}</td><td class="num">${b.localHands[i] != null ? fmtNum(b.localHands[i]) : '—'}</td><td class="num">${b.nemesisHands[i] != null ? fmtNum(b.nemesisHands[i]) : '—'}</td></tr>`;
    }
    const diff = bigDiff(b.localScore, b.nemesisScore);
    const verdict = b.result === 'win' ? `<span class="pvp-won">You won this blind</span>` : b.result === 'loss' ? `<span class="pvp-lost">You lost this blind</span>` : '';
    return `<details class="pvp-blind-detail"><summary><span class="arrow">▸</span> Blind ${b.index} ${verdict} <span class="muted" style="margin-left:auto">${esc(g.localName)} ${fmtNum(b.localScore)} · ${esc(g.nemesisName)} ${fmtNum(b.nemesisScore)}</span></summary>
      <table class="tbl hand-grid"><thead><tr><th>Hand</th><th class="col-you">${esc(g.localName)}</th><th class="col-opp">${esc(g.nemesisName)}</th></tr></thead><tbody>${hrows}
      <tr class="total"><td>Total</td><td class="num">${fmtNum(b.localScore)}</td><td class="num">${fmtNum(b.nemesisScore)}</td></tr></tbody></table></details>`;
  }).join('');

  return `<div class="panel"><h2><span class="accent"></span>PVP Blinds</h2>
    <table class="tbl"><thead><tr><th>Blind</th><th class="col-you">${esc(g.localName)}</th><th class="col-opp">${esc(g.nemesisName)}</th></tr></thead>
    <tbody>${rows}<tr class="total"><td>Total ${youWonTotal ? '🏆' : ''}</td><td class="num ${youWonTotal ? 'win-cell' : ''}">${fmtNum(lt)}</td><td class="num ${!youWonTotal ? 'win-cell' : ''}">${fmtNum(nt)}</td></tr></tbody></table>
    <div class="pvp-hands">${detail}</div></div>`;
}

function eventsPanel(g) {
  if (!g.events.length) return '';
  const rows = g.events.map((e, i) => {
    const ico = EVENT_ICON[e.type] ? `<span class="ico">${EVENT_ICON[e.type]}</span>` : '';
    return `<div class="event ${e.side} ev-${e.type}" data-side="${e.side}" data-i="${i}">
      <span class="et">${esc(e.t)}</span><span class="ex">${ico}${esc(e.text)}</span></div>`;
  }).join('');
  return `<div class="panel"><h2><span class="accent"></span>Events <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(${g.events.length})</span></h2>
    <div class="ev-filter">
      <button class="active" data-ev="all">All</button>
      <button data-ev="local">You</button>
      <button data-ev="nemesis">Opponent</button>
      <button data-ev="system">Key moments</button>
    </div>
    <div class="events" id="events">${rows}</div></div>`;
}
function wireEventFilters() {
  const btns = $$('.ev-filter button');
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.classList.remove('active')); b.classList.add('active');
    const f = b.dataset.ev;
    $$('#events .event').forEach((ev) => {
      ev.style.display = (f === 'all' || ev.dataset.side === f) ? '' : 'none';
    });
  }));
}

// ----------------------------- stats view ---------------------------------
function wrColor(r) { return r >= 55 ? 'var(--green)' : r <= 45 ? 'var(--red)' : 'var(--text)'; }
function winrateRows(arr, label) {
  if (!arr.length) return '<div class="muted">No data</div>';
  const max = Math.max(1, ...arr.map((x) => x.games));
  return arr.map((x) => `<div class="wr-row">
    <span class="wr-name" title="${esc(x.key)}">${esc(x.key)}</span>
    <div class="wr-bar"><span class="wr-fill" style="width:${x.games / max * 100}%"></span></div>
    <span class="wr-rec">${x.wins}–${x.losses}</span>
    <span class="wr-pct" style="color:${wrColor(x.winrate)}">${x.winrate}%</span>
  </div>`).join('');
}
function countBars(arr, keyFn) {
  if (!arr.length) return '<div class="muted">No data</div>';
  const max = Math.max(1, ...arr.map((x) => x.count));
  return arr.map((x) => `<div class="wr-row">
    <span class="wr-name" title="${esc(keyFn ? keyFn(x.key) : x.key)}">${esc(keyFn ? keyFn(x.key) : x.key)}</span>
    <div class="wr-bar"><span class="wr-fill alt" style="width:${x.count / max * 100}%"></span></div>
    <span class="wr-pct">${x.count}</span>
  </div>`).join('');
}

function recordCard(label, value, sub, id) {
  return `<a class="rec-card" href="#/game/${encodeURIComponent(id)}">
    <div class="rec-label">${label}</div><div class="rec-value">${value}</div><div class="rec-sub">${esc(sub)}</div></a>`;
}
function recordsPanel(R, t) {
  if (!R) return '';
  const cards = [];
  if (R.economyUsd) cards.push(recordCard('Biggest economy gap', '$' + fmtNum(Math.abs(R.economyUsd.diff)), `$${fmtNum(R.economyUsd.you)} vs $${fmtNum(R.economyUsd.opp)} · ${R.economyUsd.who}`, R.economyUsd.id));
  if (R.economyPct) cards.push(recordCard('Biggest economy gap (%)', R.economyPct.value + '%', `$${fmtNum(R.economyPct.you)} vs $${fmtNum(R.economyPct.opp)} · ${R.economyPct.who}`, R.economyPct.id));
  if (R.biggestComeback) cards.push(recordCard('Best economy comeback', 'Won −$' + fmtNum(-R.biggestComeback.diff), `Won while spending $${fmtNum(-R.biggestComeback.diff)} less · ${R.biggestComeback.who}`, R.biggestComeback.id));
  if (R.topGameSpend) cards.push(recordCard('Most spent in a game', '$' + fmtNum(R.topGameSpend.value), R.topGameSpend.who, R.topGameSpend.id));
  if (R.topShop) cards.push(recordCard('Priciest single shop', '$' + fmtNum(R.topShop.value), `Shop ${R.topShop.shop} · ${R.topShop.who}`, R.topShop.id));
  if (R.mostRerolls) cards.push(recordCard('Most rerolls (1 game)', fmtNum(R.mostRerolls.value), `$${fmtNum(R.mostRerolls.cost)} spent · ${R.mostRerolls.who}`, R.mostRerolls.id));
  if (R.biggestBlowout) cards.push(recordCard('Biggest PVP blowout', fmtCompact(R.biggestBlowout.ratio) + '×', `Blind ${R.biggestBlowout.blind} · ${R.biggestBlowout.who}`, R.biggestBlowout.id));
  if (R.mostHands) cards.push(recordCard('Most hands played', fmtNum(R.mostHands.value), R.mostHands.who, R.mostHands.id));
  if (R.mostJokersSold) cards.push(recordCard('Most jokers sold', fmtNum(R.mostJokersSold.value), R.mostJokersSold.who, R.mostJokersSold.id));
  if (t && t.longest) cards.push(recordCard('Longest game', fmtDuration(t.longest.durationSec), t.longest.who, t.longest.id));
  if (!cards.length) return '';
  return `<div class="panel"><h2><span class="accent"></span>Records &amp; Highlights</h2><div class="rec-grid">${cards.join('')}</div></div>`;
}

async function renderStats() {
  setActive('stats');
  $('#app').innerHTML = `<div class="page-head"><h1>Stats</h1></div><div class="loading">Crunching ${App.games.length} games…</div>`;
  let s;
  try { s = await api('/api/stats'); } catch (_) { $('#app').innerHTML = '<div class="empty">Could not load stats.</div>'; return; }
  const t = s.totals, e = s.economy, p = s.pvp, st = s.streaks;
  const link = (id, txt) => `<a class="linkbtn" href="#/game/${encodeURIComponent(id)}">${esc(txt)}</a>`;
  const editionLabel = { foil: 'Foil', holo: 'Holographic', polychrome: 'Polychrome', negative: 'Negative' };

  $('#app').innerHTML = `
    <div class="page-head"><h1>Stats</h1><span class="muted">${t.games} games · ${App.favorites.size} favorited</span></div>

    <div class="stat-cards">
      <div class="bigstat"><div class="n">${t.games}</div><div class="l">Games logged</div></div>
      <div class="bigstat"><div class="n" style="color:var(--green)">${t.wins}</div><div class="l">Wins</div></div>
      <div class="bigstat"><div class="n" style="color:var(--red)">${t.losses}</div><div class="l">Losses</div></div>
      <div class="bigstat"><div class="n">${t.winrate}%</div><div class="l">Win rate</div></div>
      <div class="bigstat"><div class="n">${t.unfinished}</div><div class="l">Unfinished</div></div>
      <div class="bigstat"><div class="n">${fmtDuration(t.playtimeSec)}</div><div class="l">Total playtime</div></div>
      <div class="bigstat"><div class="n">${fmtDuration(t.avgLenSec)}</div><div class="l">Avg game</div></div>
      <div class="bigstat"><div class="n" style="color:${st.currentType === 'win' ? 'var(--green)' : 'var(--red)'}">${st.current}${st.currentType === 'win' ? 'W' : st.currentType === 'loss' ? 'L' : ''}</div><div class="l">Current streak</div></div>
    </div>

    <div class="panel"><h2><span class="accent"></span>Win / Loss</h2>
      <div class="bar"><div class="seg-win" style="width:${t.decided ? t.wins / t.decided * 100 : 0}%"></div><div class="seg-loss" style="width:${t.decided ? t.losses / t.decided * 100 : 0}%"></div></div>
      <div class="bar-legend"><span><span class="dotc" style="background:var(--green)"></span>${t.wins} wins</span><span class="muted">best streak ${st.bestWin}W · worst ${st.worstLoss}L · ${t.unfinished} unfinished</span><span><span class="dotc" style="background:var(--red)"></span>${t.losses} losses</span></div>
    </div>

    ${recordsPanel(s.records, t)}

    <div class="two-col">
      <div class="panel"><h2><span class="accent"></span>Win Rate by Role</h2>${winrateRows(s.byRole)}</div>
      <div class="panel"><h2><span class="accent"></span>Win Rate by Stake</h2>${winrateRows(s.byStake)}</div>
    </div>
    <div class="two-col">
      <div class="panel"><h2><span class="accent"></span>Win Rate by Deck</h2>${winrateRows(s.byDeck)}</div>
      <div class="panel"><h2><span class="accent"></span>Win Rate by Ruleset</h2>${winrateRows(s.byRuleset)}</div>
    </div>

    <div class="panel"><h2><span class="accent"></span>Head-to-Head (Opponents)</h2>
      <table class="tbl"><thead><tr><th>Opponent</th><th>Games</th><th>W</th><th>L</th><th>Win rate</th></tr></thead><tbody>
      ${s.opponents.slice(0, 20).map((o) => `<tr><td>${esc(o.key)}</td><td class="num">${o.games}</td><td class="num" style="color:var(--green)">${o.wins}</td><td class="num" style="color:var(--red)">${o.losses}</td><td class="num" style="color:${wrColor(o.winrate)}">${o.winrate}%</td></tr>`).join('')}
      </tbody></table></div>

    <div class="stat-cards">
      <div class="bigstat"><div class="n">${fmtNum(e.rerollCount)}</div><div class="l">Total rerolls · $${fmtNum(e.rerollCost)}</div></div>
      <div class="bigstat"><div class="n">${e.avgRerolls}</div><div class="l">Avg rerolls / game</div></div>
      <div class="bigstat"><div class="n">$${fmtNum(e.shopSpend)}</div><div class="l">Total shop spend</div></div>
      <div class="bigstat"><div class="n">${fmtNum(e.handsPlayed)}</div><div class="l">Hands played</div></div>
      <div class="bigstat"><div class="n">${fmtNum(e.cardsUsed)}</div><div class="l">Consumables used</div></div>
      <div class="bigstat"><div class="n">${fmtNum(e.jokersSold)}</div><div class="l">Jokers sold</div></div>
    </div>

    <div class="panel"><h2><span class="accent"></span>PVP</h2>
      <div class="stat-cards" style="margin-bottom:6px">
        <div class="bigstat"><div class="n">${fmtNum(p.blinds)}</div><div class="l">PVP blinds played</div></div>
        <div class="bigstat"><div class="n" style="color:${wrColor(p.winrate)}">${p.winrate}%</div><div class="l">Blind win rate (${p.won}–${p.lost})</div></div>
        <div class="bigstat"><div class="n" style="font-size:20px">${fmtNum(p.biggestHand.score)}</div><div class="l">Best single hand ${p.biggestHand.id ? '· ' + link(p.biggestHand.id, 'vs ' + p.biggestHand.vs) : ''}</div></div>
        <div class="bigstat"><div class="n" style="font-size:20px">${fmtNum(p.biggestBlind.score)}</div><div class="l">Best blind total ${p.biggestBlind.id ? '· ' + link(p.biggestBlind.id, 'vs ' + p.biggestBlind.vs) : ''}</div></div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel"><h2><span class="accent"></span>Most Used Jokers</h2>${countBars(s.topJokers)}</div>
      <div class="panel"><h2><span class="accent"></span>Most Used Vouchers</h2>${countBars(s.topVouchers)}</div>
    </div>

    <div class="two-col">
      <div class="panel"><h2><span class="accent"></span>Final Joker Editions</h2>${countBars(s.jokerEditions, (k) => editionLabel[k] || k)}</div>
      <div class="panel"><h2><span class="accent"></span>Most Played Decks</h2>${countBars(s.topDecks)}</div>
    </div>

    <div class="panel"><h2><span class="accent"></span>Activity by Month</h2>
      <div class="months">${s.activity.map((m) => {
    const max = Math.max(1, ...s.activity.map((x) => x.count));
    return `<div class="month-col"><div class="month-bar" style="height:${Math.max(6, m.count / max * 120)}px" title="${m.count} games"></div><div class="month-lbl">${m.month.slice(2)}</div><div class="month-n">${m.count}</div></div>`;
  }).join('')}</div></div>`;
}

// ----------------------------- setup (first run) ---------------------------
function renderSetup() {
  setActive(null);
  const s = App.settings || {};
  $('#app').innerHTML = `
    <div class="setup">
      <div class="setup-card">
        <div class="setup-pip">♠♥♣♦</div>
        <h1>Welcome to the Log Viewer</h1>
        <p class="muted">Point the app at your Balatro Multiplayer logs folder. It usually lives here:</p>
        <code class="setup-default">%APPDATA%\\Balatro\\Mods\\lovely\\log</code>
        <label class="setup-label">Logs folder</label>
        <div class="setup-input"><input id="setup-dir" value="${esc(s.logDir || '')}" placeholder="C:\\Users\\you\\AppData\\Roaming\\Balatro\\Mods\\lovely\\log"/></div>
        <div id="setup-status" class="setup-status"></div>
        <div class="setup-actions">
          <button class="btn-ghost" id="setup-check">Check folder</button>
          <button class="btn-primary" id="setup-go" disabled>Continue →</button>
        </div>
      </div>
    </div>`;
  const input = $('#setup-dir'), status = $('#setup-status'), go = $('#setup-go');
  let okPath = null;
  const check = async () => {
    const path = input.value.trim();
    if (!path) { status.innerHTML = ''; go.disabled = true; return; }
    status.innerHTML = '<span class="muted">Checking…</span>';
    const r = await api('/api/validate-dir?path=' + encodeURIComponent(path));
    if (r.accessible) {
      status.innerHTML = `<span class="ok">✓ Found ${r.logCount} log file${r.logCount === 1 ? '' : 's'}</span>`;
      go.disabled = false; okPath = path;
    } else {
      status.innerHTML = `<span class="bad">✗ Folder not found or unreadable</span>`;
      go.disabled = true; okPath = null;
    }
  };
  input.addEventListener('input', () => { go.disabled = true; });
  $('#setup-check').addEventListener('click', check);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = 'Loading…';
    await saveSettings({ logDir: okPath || input.value.trim(), configured: true });
    location.hash = '#/games';
    location.reload();
  });
  // auto-check the prefilled default
  if (input.value.trim()) check();
}

// ----------------------------- settings page -------------------------------
function renderSettings() {
  setActive('settings');
  const s = App.settings;
  const themeOpts = Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${v.name}</option>`).join('');
  const enhPickers = ENH_LIST.map((k) => `<label class="cp"><input type="color" data-enh="${k}" value="${s.enhColors[k]}"><span>${ENH_NAME[k]}</span></label>`).join('');
  const sealPickers = SEAL_LIST.map((k) => `<label class="cp"><input type="color" data-seal="${k}" value="${s.sealColors[k]}"><span>${k} seal</span></label>`).join('');
  // a sample mini-deck to preview colors live
  const sample = [
    { suit: 'H', rank: 'A', enhancement: 'm_mult' }, { suit: 'S', rank: 'K', enhancement: 'm_steel' },
    { suit: 'D', rank: 'Q', enhancement: 'm_gold' }, { suit: 'C', rank: 'J', enhancement: 'm_glass' },
    { suit: 'H', rank: 'T', enhancement: 'm_bonus' }, { suit: 'S', rank: '9', enhancement: 'm_wild' },
    { suit: 'D', rank: '8', enhancement: 'm_stone' }, { suit: 'C', rank: '7', enhancement: 'm_lucky' },
    { suit: 'H', rank: '6', seal: 'Red' }, { suit: 'S', rank: '5', seal: 'Blue' },
    { suit: 'D', rank: '4', seal: 'Gold' }, { suit: 'C', rank: '3', seal: 'Purple' },
  ];

  $('#app').innerHTML = `
    <div class="page-head"><h1>⚙ Settings</h1></div>

    <div class="panel"><h2><span class="accent"></span>Logs Folder</h2>
      <p class="muted" style="margin-top:0">Where the app reads your Balatro Multiplayer logs from.</p>
      <div class="setup-input"><input id="set-dir" value="${esc(s.logDir || '')}"/></div>
      <div id="set-dir-status" class="setup-status">${s.accessible ? `<span class="ok">✓ ${s.logCount} log files found</span>` : '<span class="bad">✗ folder not accessible</span>'}</div>
      <div class="setup-actions" style="justify-content:flex-start">
        <button class="btn-ghost" id="set-dir-check">Check</button>
        <button class="btn-primary" id="set-dir-save">Save & reload</button>
      </div>
    </div>

    <div class="panel"><h2><span class="accent"></span>Appearance</h2>
      <div class="set-grid">
        <div class="set-field"><label>Theme</label><select class="pill" id="set-theme">${themeOpts}</select></div>
        <div class="set-field"><label>Accent color</label><input type="color" id="set-accent" value="${s.accent}"></div>
      </div>
      <div class="theme-swatches">${Object.entries(THEMES).map(([k, v]) => `<button class="swatch ${s.theme === k ? 'on' : ''}" data-theme="${k}" style="background:${v.vars['--panel']};border-color:${v.vars['--line']}"><span style="background:${v.vars['--bg']}"></span><span style="background:${v.vars['--text']}"></span><em>${v.name}</em></button>`).join('')}</div>
    </div>

    <div class="panel"><h2><span class="accent"></span>Card Enhancement Colors</h2>
      <div class="cp-grid">${enhPickers}</div>
      <h2 style="margin-top:18px"><span class="accent"></span>Seal Colors</h2>
      <div class="cp-grid">${sealPickers}</div>
      <div class="deck-view" id="color-preview" style="margin-top:16px">${deckView(sample)}</div>
      <div class="setup-actions" style="justify-content:flex-start;margin-top:16px">
        <button class="btn-ghost" id="set-colors-reset">Reset colors</button>
      </div>
    </div>`;

  // logs folder
  $('#set-dir-check').addEventListener('click', async () => {
    const r = await api('/api/validate-dir?path=' + encodeURIComponent($('#set-dir').value.trim()));
    $('#set-dir-status').innerHTML = r.accessible ? `<span class="ok">✓ ${r.logCount} log files found</span>` : '<span class="bad">✗ folder not accessible</span>';
  });
  $('#set-dir-save').addEventListener('click', async () => {
    await saveSettings({ logDir: $('#set-dir').value.trim(), configured: true });
    toast('Logs folder saved');
    location.reload();
  });

  // theme
  const applyTheme = (theme) => { saveSettings({ theme }); $$('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.theme === theme)); $('#set-theme').value = theme; };
  $('#set-theme').addEventListener('change', (ev) => applyTheme(ev.target.value));
  $$('.swatch').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
  $('#set-accent').addEventListener('input', (ev) => { App.settings.accent = ev.target.value; applySettings(); });
  $('#set-accent').addEventListener('change', (ev) => saveSettings({ accent: ev.target.value }));

  // colors (live preview on input, persist on change)
  const refreshPreview = () => { $('#color-preview').innerHTML = deckView(sample); };
  $$('[data-enh]').forEach((inp) => {
    inp.addEventListener('input', () => { App.settings.enhColors[inp.dataset.enh] = inp.value; refreshPreview(); });
    inp.addEventListener('change', () => saveSettings({ enhColors: App.settings.enhColors }));
  });
  $$('[data-seal]').forEach((inp) => {
    inp.addEventListener('input', () => { App.settings.sealColors[inp.dataset.seal] = inp.value; refreshPreview(); });
    inp.addEventListener('change', () => saveSettings({ sealColors: App.settings.sealColors }));
  });
  $('#set-colors-reset').addEventListener('click', async () => {
    await saveSettings({ enhColors: Object.assign({}, DEFAULT_ENH), sealColors: Object.assign({}, DEFAULT_SEAL) });
    renderSettings();
    toast('Colors reset to defaults');
  });
}

// ----------------------------- router -------------------------------------
function setActive(route) {
  $$('.mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
}
function router() {
  if (!App.loaded) return;
  if (!App.settings || !App.settings.configured) return renderSetup();
  const hash = location.hash || '#/games';
  if (hash.startsWith('#/settings')) return renderSettings();
  const m = /^#\/game\/(.+)$/.exec(hash);
  if (m) return renderDetail(decodeURIComponent(m[1]));
  if (hash.startsWith('#/favorites')) return renderList(true);
  if (hash.startsWith('#/stats')) return renderStats();
  return renderList(false);
}

// ----------------------------- events -------------------------------------
document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.stopPropagation();
    toggleFav(fav.dataset.fav).then((on) => {
      fav.classList.toggle('on', on);
      fav.textContent = on ? '★' : '☆';
      if (!on && location.hash.startsWith('#/favorites')) {
        const card = fav.closest('.gcard'); if (card) card.remove();
        const left = $$('#grid .gcard').length;
        const lc = $('#list-count'); if (lc) lc.textContent = left + ' shown';
        if (!left) { const grid = $('#grid'); if (grid) grid.innerHTML = `<div class="empty"><div class="big">★</div>No favorites yet.<br><span class="muted">Tap the star on any game to save it here.</span></div>`; }
      }
    });
    return;
  }
  const card = e.target.closest('.gcard');
  if (card) { location.hash = '#/game/' + encodeURIComponent(card.dataset.id); }
});
$('#brand').addEventListener('click', () => { location.hash = '#/games'; });
window.addEventListener('hashchange', router);

// ----------------------------- boot ---------------------------------------
(async function boot() {
  try {
    await loadSettings();
    applySettings();
    if (!App.settings.configured) { App.loaded = true; renderSetup(); return; }
    await loadGames();
    App.loaded = true;
    router();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty"><div class="big">⚠</div>Could not reach the server.<br><span class="muted">${esc(e.message)}</span></div>`;
  }
})();
