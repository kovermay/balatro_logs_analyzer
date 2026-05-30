'use strict';
// Parses a Balatro Multiplayer "lovely" log file into structured game objects.
// One log file can contain several matches (joinLobby -> startGame -> winGame /
// loseGame -> stopGame, repeated). Each match becomes one game object.

const G = require('./gameData');

const LINE_RE = /\[G\]\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+::\s+\w+\s+::\s+MULTIPLAYER\s+::\s+(.*?)\s*$/;

// Local gameplay actions that must stop being recorded once the local player's
// game is over (otherwise a spectated opponent's ongoing match floods the data).
const GAMEPLAY_ACTIONS = new Set([
  'moneyMoved', 'setLocation', 'usedCard', 'boughtCardFromShop', 'soldCard',
  'soldJoker', 'rerollShop', 'spentLastShop', 'playHand', 'skip', 'setAnte',
]);

function fmtTime(h, m, s) {
  let hh = parseInt(h, 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${m}:${s} ${ampm}`;
}

// Sent messages come in two formats depending on the mod version:
//   old (<=0.2.x): "action:foo,key:val,key2:val2"
//   new (>=0.3.x): JSON  {"action":"foo","key":val,...}
function parseSent(rest) {
  const body = rest.slice('Client sent message: '.length).trim();
  if (body.startsWith('{')) {
    try {
      const obj = JSON.parse(body);
      const action = obj.action;
      delete obj.action;
      return { action, params: obj };
    } catch (_) { return { action: '', params: {} }; }
  }
  const parts = body.split(',');
  const action = parts[0].replace(/^action:/, '');
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx === -1) continue;
    params[parts[i].slice(0, idx)] = parts[i].slice(idx + 1);
  }
  return { action, params };
}

function asBool(v) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}
function asNum(v) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
// Cumulative score samples -> per-hand deltas + total, using BigInt so the
// mod's "insane" 19-digit scores stay exact.
function toBig(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return s ? BigInt(s) : 0n;
}

// Parse "Client got NAME message:  (k: v)  (k2: v2)" -> { name, params }
function parseGot(rest) {
  const m = /^Client got (\w+) message:\s*(.*)$/.exec(rest);
  if (!m) return null;
  const name = m[1];
  const params = {};
  const re = /\(([a-zA-Z_]+):\s*([^)]*)\)/g;
  let mm;
  while ((mm = re.exec(m[2])) !== null) params[mm[1]] = mm[2].trim();
  return { name, params };
}

function parseDeck(cardsStr) {
  if (!cardsStr) return [];
  return cardsStr.split(';').map((t) => t.trim()).filter(Boolean).map((tok) => {
    const p = tok.split('-');
    const [suit, rank, enh, ed, seal] = p;
    return {
      suit, rank,
      enhancement: enh && enh !== 'c_base' ? enh : null,
      edition: G.normalizeEdition(ed),
      seal: seal && seal !== 'none' ? seal : null,
    };
  });
}

function deckStats(cards) {
  let enhanced = 0, editions = 0, seals = 0, modified = 0;
  for (const c of cards) {
    const e = !!c.enhancement, d = !!c.edition, s = !!c.seal;
    if (e) enhanced++;
    if (d) editions++;
    if (s) seals++;
    if (e || d || s) modified++;
  }
  return { count: cards.length, enhanced, editions, seals, modified };
}

function parseJokerList(str) {
  if (!str) return [];
  return str.split(';').map((t) => t.trim()).filter(Boolean).map((tok) => {
    const p = tok.split('-');
    const key = p[0];
    const edition = G.normalizeEdition(p[1]);
    const stickers = p.slice(2).filter((x) => x && x !== 'none');
    return { key, name: G.jokerName(key), edition, stickers };
  });
}

function pvpHands(scores) {
  // scores: cumulative score samples within the blind, in order (strings).
  const big = scores.map(toBig);
  const dedup = [];
  for (const s of big) if (dedup.length === 0 || dedup[dedup.length - 1] !== s) dedup.push(s);
  // keep monotonic non-decreasing
  const mono = [];
  let max = -1n;
  for (const s of dedup) { if (s >= max) { mono.push(s); max = s; } }
  if (mono.length === 0) return { total: '0', hands: [] };
  const arr = mono[0] === 0n ? mono.slice() : [0n, ...mono];
  const hands = [];
  for (let i = 1; i < arr.length; i++) hands.push((arr[i] - arr[i - 1]).toString());
  return { total: arr[arr.length - 1].toString(), hands };
}

// Close the currently-open PVP blind into a finished blind record.
function pushPvp(g, result) {
  if (!g || !g._pvp) return;
  const L = pvpHands(g._pvp.local);
  const N = pvpHands(g._pvp.nem);
  g._pvp = null;
  if (L.total === '0' && N.total === '0') return; // ignore empty/aborted blinds
  g.pvpBlinds.push({
    index: g.pvpBlinds.length + 1,
    result: result || 'unknown',
    localScore: L.total, nemesisScore: N.total,
    localHands: L.hands, nemesisHands: N.hands,
  });
}

function newGame(file, index, pending, deckKey, startTime, startEpoch, date) {
  const lobby = pending.lobby || {};
  const isHost = pending.isHost;
  const host = pending.host || null;
  const guest = pending.guest || null;
  let localName, nemesisName, localRole;
  if (typeof isHost === 'boolean') {
    localName = isHost ? host : guest;
    nemesisName = isHost ? guest : host;
    localRole = isHost ? 'Host' : 'Guest';
  } else {
    localName = 'You'; nemesisName = 'Opponent'; localRole = 'Unknown';
  }
  return {
    id: `${file}::${index}`,
    file, index, date,
    startTime, startEpoch, endTime: startTime, endEpoch: startEpoch,
    lobbyCode: pending.code || lobby.code || null,
    gamemode: lobby.gamemode || pending.gamemode || null,
    gamemodeLabel: G.gamemodeName(lobby.gamemode || pending.gamemode),
    ruleset: lobby.ruleset || null,
    rulesetLabel: lobby.ruleset ? G.rulesetName(lobby.ruleset) : null,
    stake: lobby.stake != null ? Number(lobby.stake) : null,
    stakeInfo: lobby.stake != null ? G.stakeInfo(Number(lobby.stake)) : null,
    deckKey: lobby.back || deckKey || null,
    deckName: G.deckName(lobby.back || deckKey),
    seed: null,
    options: {
      death_on_round_loss: asBool(lobby.death_on_round_loss),
      gold_on_life_loss: asBool(lobby.gold_on_life_loss),
      no_gold_on_round_loss: asBool(lobby.no_gold_on_round_loss),
      different_decks: asBool(lobby.different_decks),
      different_seeds: asBool(lobby.different_seeds),
      multiplayer_jokers: asBool(lobby.multiplayer_jokers),
      starting_lives: asNum(lobby.starting_lives),
      pvp_start_round: asNum(lobby.pvp_start_round),
      showdown_starting_antes: asNum(lobby.showdown_starting_antes),
      timer_base_seconds: asNum(lobby.timer_base_seconds),
      timer_increment_seconds: asNum(lobby.timer_increment_seconds),
    },
    host, guest, isHost: typeof isHost === 'boolean' ? isHost : null,
    localName, nemesisName, localRole,
    result: 'unknown', winner: null,
    localShops: [], nemesisShops: [],
    local: { rerollCount: 0, rerollCost: 0, vouchers: [], jokers: [], deck: [], deckStats: null },
    nemesis: { rerollCount: 0, rerollCost: 0, vouchers: [], jokers: [], deck: [], deckStats: null },
    pvpBlinds: [],
    events: [],
    counters: { handsPlayed: 0, cardsBought: 0, cardsSold: 0, jokersSold: 0, cardsUsed: 0, maxAnte: 0 },
    // transient working state (deleted before returning)
    _pvp: null,
  };
}

function finalizeGame(g) {
  // close any still-open PVP blind (game ended without an explicit endPvP)
  if (g._pvp) pushPvp(g, g.result === 'win' ? 'win' : g.result === 'loss' ? 'loss' : 'unknown');
  // who won
  if (g.result === 'win') g.winner = g.localName;
  else if (g.result === 'loss') g.winner = g.nemesisName;
  // local reroll fallback from rerollShop events if stats missing
  if (g.local.rerollCount === 0 && g._rerollCount) {
    g.local.rerollCount = g._rerollCount;
    g.local.rerollCost = g._rerollCost;
  }
  g.local.deckStats = deckStats(g.local.deck);
  g.nemesis.deckStats = deckStats(g.nemesis.deck);
  g.durationSec = Math.max(0, Math.round((g.endEpoch - g.startEpoch) / 1000));

  // economy timeline: per-shop spending for both players + blind/PVP context
  const ns = Math.max(g.localShops.length, g.nemesisShops.length);
  g.economy = [];
  for (let i = 0; i < ns; i++) {
    g.economy.push({
      shop: i + 1,
      you: g.localShops[i] != null ? g.localShops[i] : null,
      opp: g.nemesisShops[i] != null ? g.nemesisShops[i] : null,
      pvp: !!(g._shopPvp && g._shopPvp[i]),
      ante: (g._shopAnte && g._shopAnte[i] != null) ? g._shopAnte[i] : null,
    });
  }
  const youTot = g.localShops.reduce((s, x) => s + x, 0);
  const oppTot = g.nemesisShops.reduce((s, x) => s + x, 0);
  g.economyTotals = { you: youTot, opp: oppTot, diff: youTot - oppTot };

  delete g._pvp; delete g._rerollCount; delete g._rerollCost;
  delete g._shopPvp; delete g._shopAnte; delete g._pvpThisRound; delete g._curAnte;
  delete g._ended; delete g._lastEnemyLoc;
  return g;
}

function parseLog(text, file) {
  const lines = text.split(/\r?\n/);
  const games = [];
  let pending = { lobby: {}, isHost: undefined, host: null, guest: null, code: null, gamemode: null };
  let cur = null;
  let gameIndex = 0;

  const ev = (g, side, type, text) => {
    if (!g) return;
    g.events.push({ t: g._lastTime, epoch: g._lastEpoch, side, type, text });
  };

  for (const line of lines) {
    const lm = LINE_RE.exec(line);
    if (!lm) continue;
    const [, Y, Mo, D, h, mi, s, rest] = lm;
    const time = fmtTime(h, mi, s);
    const epoch = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s);
    if (cur) { cur._lastTime = time; cur._lastEpoch = epoch; cur.endTime = time; cur.endEpoch = epoch; }

    // ---- lobby / setup messages (update pending) ----
    if (rest.startsWith('Client got lobbyOptions') || rest.startsWith('Client got lobbyInfo') ||
        rest.startsWith('Client got joinedLobby') || rest.startsWith('Client got rejoinedLobby')) {
      const got = parseGot(rest);
      if (!got) continue;
      if (got.name === 'lobbyOptions') Object.assign(pending.lobby, got.params);
      else if (got.name === 'lobbyInfo') {
        if (got.params.host) pending.host = got.params.host;
        if (got.params.guest) pending.guest = got.params.guest;
        if (got.params.isHost != null) pending.isHost = got.params.isHost === 'true';
      } else { // joined / rejoined lobby
        pending.code = got.params.code || pending.code;
        pending.gamemode = got.params.type || pending.gamemode;
      }
      continue;
    }

    if (rest.startsWith('Client sent message:')) {
      const { action, params } = parseSent(rest);
      switch (action) {
        case 'createLobby':
          pending.gamemode = params.gameMode || pending.gamemode; break;
        case 'joinLobby':
          pending.code = params.code || pending.code; break;
        case 'lobbyOptions':
          Object.assign(pending.lobby, params); break;
        default: break;
      }
      if (!cur) {
        // local-side actions only matter once a game is open
        if (action === 'receiveNemesisDeck') { /* could precede? ignore */ }
        continue;
      }
      // once the local game is over, ignore further gameplay (keep end-game data)
      if (cur._ended && GAMEPLAY_ACTIONS.has(action)) continue;
      // ---- in-game local actions ----
      switch (action) {
        case 'moneyMoved': {
          const amt = Number(params.amount) || 0;
          if (amt > 0) ev(cur, 'local', 'money-up', `Gained $${amt}`);
          else if (amt < 0) ev(cur, 'local', 'money-down', `Spent $${-amt}`);
          break;
        }
        case 'setLocation':
          ev(cur, 'local', 'move', `Moved to ${G.locationLabel(params.location)}`);
          break;
        case 'usedCard':
          cur.counters.cardsUsed++;
          ev(cur, 'local', 'use', `Used ${params.card}`);
          break;
        case 'boughtCardFromShop':
          cur.counters.cardsBought++;
          ev(cur, 'local', 'buy', `Bought ${params.card}${params.cost ? ` ($${params.cost})` : ''}`);
          break;
        case 'soldCard':
          cur.counters.cardsSold++;
          ev(cur, 'local', 'sell', `Sold ${params.card}`);
          break;
        case 'soldJoker':
          cur.counters.jokersSold++;
          ev(cur, 'local', 'sell', 'Sold a joker');
          break;
        case 'rerollShop': {
          const c = Number(params.cost) || 0;
          cur._rerollCount = (cur._rerollCount || 0) + 1;
          cur._rerollCost = (cur._rerollCost || 0) + c;
          ev(cur, 'local', 'reroll', `Rerolled shop for $${c}`);
          break;
        }
        case 'spentLastShop': {
          const n = Number(params.amount) || 0;
          cur.localShops.push(n);
          cur._shopPvp.push(cur._pvpThisRound);
          cur._shopAnte.push(cur._curAnte);
          cur._pvpThisRound = false;
          ev(cur, 'local', 'report', `Reported spending $${n} last shop`);
          break;
        }
        case 'playHand': {
          cur.counters.handsPlayed++;
          if (cur._pvp) cur._pvp.local.push(Number(params.score) || 0);
          break;
        }
        case 'skip':
          ev(cur, 'local', 'skip', 'Skipped blind');
          break;
        case 'setAnte': {
          const a = Number(params.ante) || 0;
          cur._curAnte = a;
          if (a > cur.counters.maxAnte) cur.counters.maxAnte = a;
          break;
        }
        case 'nemesisEndGameStats': {
          cur.local.rerollCount = Number(params.reroll_count) || 0;
          cur.local.rerollCost = Number(params.reroll_cost_total) || 0;
          cur.local.vouchers = (params.vouchers || '').split('-').filter(Boolean)
            .map((k) => ({ key: k, name: G.voucherName(k) }));
          break;
        }
        case 'receiveNemesisDeck': // local sends its OWN deck
          if (!cur.local.deck.length) cur.local.deck = parseDeck(params.cards);
          break;
        default: break;
      }
      // human readable jokers lines come as plain text, handled below
      continue;
    }

    // ---- plain helper lines ----
    if (rest.startsWith('Sending end game jokers:')) {
      if (cur && !cur.local.jokers.length) cur.local.jokers = parseJokerList(rest.slice('Sending end game jokers:'.length));
      continue;
    }
    if (rest.startsWith('Received end game jokers:')) {
      if (cur && !cur.nemesis.jokers.length) cur.nemesis.jokers = parseJokerList(rest.slice('Received end game jokers:'.length));
      continue;
    }

    if (rest.startsWith('Client got')) {
      const got = parseGot(rest);
      if (!got) continue;
      switch (got.name) {
        case 'startGame': {
          if (cur) games.push(finalizeGame(cur));
          cur = newGame(file, gameIndex++, pending, got.params.deck, time, epoch, `${Y}-${Mo}-${D}`);
          cur._lastTime = time; cur._lastEpoch = epoch;
          cur._shopPvp = []; cur._shopAnte = []; cur._pvpThisRound = false; cur._curAnte = 0;
          cur._ended = false;
          break;
        }
        case 'winGame':
          if (cur) { cur.result = 'win'; pushPvp(cur, 'win'); cur._ended = true; ev(cur, 'system', 'win', 'You won the game'); }
          break;
        case 'loseGame':
          if (cur) { cur.result = 'loss'; pushPvp(cur, 'loss'); cur._ended = true; ev(cur, 'system', 'lose', 'You lost the game'); }
          break;
        case 'stopGame':
          if (cur) { if (got.params.seed) cur.seed = got.params.seed; cur._ended = true; }
          break;
        case 'spentLastShop':
          if (cur && !cur._ended) {
            const n = Number(got.params.amount) || 0;
            cur.nemesisShops.push(n);
            ev(cur, 'nemesis', 'report', `Opponent spent $${n} in shop`);
          }
          break;
        case 'soldJoker':
          if (cur && !cur._ended) ev(cur, 'nemesis', 'sell', 'Opponent sold a joker');
          break;
        case 'enemyLocation':
          if (cur && !cur._ended) {
            const lbl = G.locationLabel(got.params.location);
            if (cur._lastEnemyLoc !== lbl) {
              cur._lastEnemyLoc = lbl;
              ev(cur, 'nemesis', 'move', `Opponent moved to ${lbl}`);
            }
          }
          break;
        case 'enemyInfo':
          if (cur && cur._pvp && got.params.score != null) cur._pvp.nem.push(Number(got.params.score) || 0);
          break;
        case 'startBlind':
          if (cur && !cur._ended) { cur._pvp = { local: [], nem: [] }; cur._pvpThisRound = true; ev(cur, 'system', 'pvp-start', 'PVP blind started'); }
          break;
        case 'endPvP':
          if (cur && cur._pvp) {
            const lost = got.params.lost === 'true';
            pushPvp(cur, lost ? 'loss' : 'win');
            ev(cur, 'system', lost ? 'pvp-loss' : 'pvp-win', lost ? 'Lost PVP blind' : 'Won PVP blind');
          }
          break;
        case 'receiveNemesisDeck':
          if (cur && !cur.nemesis.deck.length) cur.nemesis.deck = parseDeck(got.params.cards);
          if (cur && got.params.seed && !cur.seed) cur.seed = got.params.seed;
          break;
        case 'receiveEndGameJokers':
          if (cur && got.params.seed && !cur.seed) cur.seed = got.params.seed;
          break;
        case 'nemesisEndGameStats':
          if (cur) {
            cur.nemesis.rerollCount = Number(got.params.reroll_count) || 0;
            cur.nemesis.rerollCost = Number(got.params.reroll_cost_total) || 0;
            cur.nemesis.vouchers = (got.params.vouchers || '').split('-').filter(Boolean)
              .map((k) => ({ key: k, name: G.voucherName(k) }));
          }
          break;
        default: break;
      }
      continue;
    }
  }
  if (cur) games.push(finalizeGame(cur));
  return games;
}

module.exports = { parseLog };
