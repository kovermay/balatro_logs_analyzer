'use strict';
// Aggregates a comprehensive stats object from all parsed games.

function baseName(n) { return String(n || '').replace(/~\d+$/, ''); }
function toBig(v) { const s = String(v == null ? '' : v).replace(/[^0-9]/g, ''); return s ? BigInt(s) : 0n; }
function rate(w, l) { return (w + l) ? Math.round((w / (w + l)) * 1000) / 10 : 0; }

function bump(map, key, result) {
  if (key == null || key === '') return;
  const b = map[key] || (map[key] = { games: 0, wins: 0, losses: 0 });
  b.games++;
  if (result === 'win') b.wins++; else if (result === 'loss') b.losses++;
}
function bucketsToArray(map, extra) {
  return Object.entries(map).map(([k, v]) => ({
    key: k, games: v.games, wins: v.wins, losses: v.losses, winrate: rate(v.wins, v.losses),
    ...(extra ? extra(k) : {}),
  })).sort((a, b) => b.games - a.games);
}

function computeStats(games) {
  const sorted = games.slice().sort((a, b) => a.startEpoch - b.startEpoch);
  const n = games.length;

  let wins = 0, losses = 0, unfinished = 0, playtime = 0;
  let longest = null, shortest = null;
  const byDeck = {}, byStake = {}, byRuleset = {}, byMode = {};
  const byRole = {};
  const opp = {};
  let rerollCount = 0, rerollCost = 0, nemReroll = 0, shopSpend = 0, nemShopSpend = 0, handsPlayed = 0;
  let cardsBought = 0, cardsSold = 0, jokersSold = 0, cardsUsed = 0;
  const jokerFreq = {}, jokerEdition = {}, voucherFreq = {}, deckUse = {};
  let pvpBlinds = 0, pvpWon = 0, pvpLost = 0;
  let biggestHand = { score: 0n }, biggestBlind = { score: 0n };
  const byDate = {}, byMonth = {};

  for (const g of games) {
    const decided = g.result === 'win' || g.result === 'loss';
    if (g.result === 'win') wins++;
    else if (g.result === 'loss') losses++;
    else unfinished++;
    playtime += g.durationSec || 0;
    if (g.durationSec) {
      if (!longest || g.durationSec > longest.durationSec) longest = { id: g.id, durationSec: g.durationSec, who: `${g.localName} vs ${g.nemesisName}` };
      if (!shortest || g.durationSec < shortest.durationSec) shortest = { id: g.id, durationSec: g.durationSec, who: `${g.localName} vs ${g.nemesisName}` };
    }

    bump(byDeck, g.deckName, g.result);
    if (g.stakeInfo) bump(byStake, g.stakeInfo.name, g.result);
    if (g.rulesetLabel) bump(byRuleset, g.rulesetLabel, g.result);
    if (g.gamemodeLabel) bump(byMode, g.gamemodeLabel, g.result);
    if (g.localRole) bump(byRole, g.localRole, g.result);
    bump(opp, baseName(g.nemesisName), g.result);
    deckUse[g.deckName] = (deckUse[g.deckName] || 0) + 1;

    rerollCount += g.local.rerollCount || 0;
    rerollCost += g.local.rerollCost || 0;
    nemReroll += g.nemesis.rerollCount || 0;
    shopSpend += (g.localShops || []).reduce((s, x) => s + x, 0);
    nemShopSpend += (g.nemesisShops || []).reduce((s, x) => s + x, 0);
    handsPlayed += g.counters.handsPlayed || 0;
    cardsBought += g.counters.cardsBought || 0;
    cardsSold += g.counters.cardsSold || 0;
    jokersSold += g.counters.jokersSold || 0;
    cardsUsed += g.counters.cardsUsed || 0;

    for (const j of g.local.jokers) {
      jokerFreq[j.name] = (jokerFreq[j.name] || 0) + 1;
      if (j.edition) jokerEdition[j.edition] = (jokerEdition[j.edition] || 0) + 1;
    }
    for (const v of g.local.vouchers) voucherFreq[v.name] = (voucherFreq[v.name] || 0) + 1;

    for (const b of g.pvpBlinds) {
      pvpBlinds++;
      if (b.result === 'win') pvpWon++; else if (b.result === 'loss') pvpLost++;
      const bs = toBig(b.localScore);
      if (bs > biggestBlind.score) biggestBlind = { score: bs, id: g.id, vs: baseName(g.nemesisName), blind: b.index };
      for (const h of b.localHands) {
        const hs = toBig(h);
        if (hs > biggestHand.score) biggestHand = { score: hs, id: g.id, vs: baseName(g.nemesisName), blind: b.index };
      }
    }

    if (g.date) {
      byDate[g.date] = (byDate[g.date] || 0) + 1;
      const mo = g.date.slice(0, 7);
      byMonth[mo] = (byMonth[mo] || 0) + 1;
    }
  }

  // streaks (chronological, decided games only)
  let curW = 0, curL = 0, bestW = 0, worstL = 0, lastResult = null, curStreak = 0, curStreakType = null;
  for (const g of sorted) {
    if (g.result === 'win') { curW++; curL = 0; if (curW > bestW) bestW = curW; }
    else if (g.result === 'loss') { curL++; curW = 0; if (curL > worstL) worstL = curL; }
    else continue;
    if (g.result === lastResult) curStreak++;
    else { curStreak = 1; curStreakType = g.result; }
    lastResult = g.result;
  }

  // ---- "records": notable per-game extremes ----
  const R = () => ({ value: -Infinity });
  const take = (r, value, info) => { if (value > r.value && isFinite(value)) { r.value = value; Object.assign(r, info); } };
  const recEcoUsd = R(), recEcoPct = R(), recShop = R(), recGameSpend = R(),
    recRerolls = R(), recRerollCost = R(), recBlowout = R(), recHands = R(),
    recJokersSold = R(), recComeback = R();
  for (const g of games) {
    const who = `${g.localName} vs ${g.nemesisName}`;
    const et = g.economyTotals || { you: 0, opp: 0, diff: 0 };
    // a match is "balanced" if both players played a comparable number of shops;
    // wildly lopsided games (idle/disconnect/spectate) skew economy comparisons.
    const ly = (g.localShops || []).length, lo = (g.nemesisShops || []).length;
    const balanced = ly > 0 && lo > 0 && Math.max(ly, lo) <= Math.min(ly, lo) * 1.6 + 4;

    if (et.you > 0) take(recGameSpend, et.you, { id: g.id, who, value: et.you });
    if (balanced) {
      take(recEcoUsd, Math.abs(et.diff), { id: g.id, who, you: et.you, opp: et.opp, diff: et.diff });
      const hi = Math.max(et.you, et.opp), mn = Math.min(et.you, et.opp);
      if (mn > 0) take(recEcoPct, Math.round((hi / mn - 1) * 100), { id: g.id, who, you: et.you, opp: et.opp, leaderYou: et.diff > 0 });
      if (g.result === 'win' && et.diff < 0) take(recComeback, -et.diff, { id: g.id, who, you: et.you, opp: et.opp, diff: et.diff });
    }
    (g.localShops || []).forEach((v, i) => take(recShop, v, { id: g.id, who, value: v, shop: i + 1 }));
    take(recRerolls, g.local.rerollCount || 0, { id: g.id, who, value: g.local.rerollCount, cost: g.local.rerollCost });
    take(recRerollCost, g.local.rerollCost || 0, { id: g.id, who, value: g.local.rerollCost, count: g.local.rerollCount });
    take(recHands, g.counters.handsPlayed || 0, { id: g.id, who, value: g.counters.handsPlayed });
    take(recJokersSold, g.counters.jokersSold || 0, { id: g.id, who, value: g.counters.jokersSold });
    for (const b of g.pvpBlinds) {
      const a = Number(toBig(b.localScore)), c = Number(toBig(b.nemesisScore));
      const hi = Math.max(a, c), mn = Math.min(a, c);
      if (mn > 0) take(recBlowout, hi / mn, { id: g.id, who, blind: b.index, you: b.localScore, opp: b.nemesisScore, ratio: Math.round(hi / mn * 10) / 10 });
    }
  }
  const clean = (r) => (r.id ? r : null);
  const records = {
    economyUsd: clean(recEcoUsd), economyPct: clean(recEcoPct), topShop: clean(recShop),
    topGameSpend: clean(recGameSpend), mostRerolls: clean(recRerolls), mostRerollCost: clean(recRerollCost),
    biggestBlowout: clean(recBlowout), mostHands: clean(recHands), mostJokersSold: clean(recJokersSold),
    biggestComeback: clean(recComeback),
  };

  const topN = (obj, k) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k).map(([key, count]) => ({ key, count }));

  // monthly activity sorted ascending
  const activity = Object.entries(byMonth).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([month, count]) => ({ month, count }));

  return {
    totals: {
      games: n, wins, losses, unfinished, decided: wins + losses, winrate: rate(wins, losses),
      playtimeSec: playtime, avgLenSec: n ? Math.round(playtime / n) : 0,
      longest, shortest,
    },
    streaks: { bestWin: bestW, worstLoss: worstL, current: curStreak, currentType: curStreakType },
    byRole: bucketsToArray(byRole),
    byDeck: bucketsToArray(byDeck),
    byStake: bucketsToArray(byStake),
    byRuleset: bucketsToArray(byRuleset),
    byMode: bucketsToArray(byMode),
    opponents: bucketsToArray(opp),
    economy: {
      rerollCount, rerollCost, nemReroll,
      avgRerolls: n ? Math.round(rerollCount / n * 10) / 10 : 0,
      shopSpend, nemShopSpend, avgShopSpend: n ? Math.round(shopSpend / n) : 0,
      handsPlayed, cardsBought, cardsSold, jokersSold, cardsUsed,
    },
    pvp: {
      blinds: pvpBlinds, won: pvpWon, lost: pvpLost, winrate: rate(pvpWon, pvpLost),
      biggestHand: { score: biggestHand.score.toString(), id: biggestHand.id, vs: biggestHand.vs, blind: biggestHand.blind },
      biggestBlind: { score: biggestBlind.score.toString(), id: biggestBlind.id, vs: biggestBlind.vs, blind: biggestBlind.blind },
    },
    records,
    topDecks: topN(deckUse, 12),
    topJokers: topN(jokerFreq, 15),
    topVouchers: topN(voucherFreq, 15),
    jokerEditions: Object.entries(jokerEdition).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    activity,
  };
}

module.exports = { computeStats };
