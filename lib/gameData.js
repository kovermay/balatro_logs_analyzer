'use strict';
// Central lookup tables that turn Balatro/Multiplayer internal keys into the
// human-readable names, colours and metadata the UI renders.

const JOKER_NAMES = require('./jokers.json');

// ---- Vouchers -------------------------------------------------------------
const VOUCHER_NAMES = {
  v_overstock_norm: 'Overstock',
  v_overstock_plus: 'Overstock Plus',
  v_clearance_sale: 'Clearance Sale',
  v_liquidation: 'Liquidation',
  v_hone: 'Hone',
  v_glow_up: 'Glow Up',
  v_reroll_surplus: 'Reroll Surplus',
  v_reroll_glut: 'Reroll Glut',
  v_crystal_ball: 'Crystal Ball',
  v_omen_globe: 'Omen Globe',
  v_telescope: 'Telescope',
  v_observatory: 'Observatory',
  v_grabber: 'Grabber',
  v_nacho_tong: 'Nacho Tong',
  v_wasteful: 'Wasteful',
  v_recyclomancy: 'Recyclomancy',
  v_tarot_merchant: 'Tarot Merchant',
  v_tarot_tycoon: 'Tarot Tycoon',
  v_planet_merchant: 'Planet Merchant',
  v_planet_tycoon: 'Planet Tycoon',
  v_seed_money: 'Seed Money',
  v_money_tree: 'Money Tree',
  v_blank: 'Blank',
  v_antimatter: 'Antimatter',
  v_magic_trick: 'Magic Trick',
  v_illusion: 'Illusion',
  v_hieroglyph: 'Hieroglyph',
  v_petroglyph: 'Petroglyph',
  v_directors_cut: "Director's Cut",
  v_retcon: 'Retcon',
  v_paint_brush: 'Paint Brush',
  v_palette: 'Palette',
};

// ---- Decks ("back") -------------------------------------------------------
const DECK_NAMES = {
  b_mp_cocktail: 'Cocktail Deck',
  b_mp_violet: 'Violet Deck',
  b_mp_orange: 'Orange Deck',
};

// ---- Stakes ---------------------------------------------------------------
const STAKES = {
  1: { name: 'White Stake', color: '#cdd2da' },
  2: { name: 'Red Stake', color: '#e35646' },
  3: { name: 'Green Stake', color: '#56a86c' },
  4: { name: 'Black Stake', color: '#5f6b7a' },
  5: { name: 'Blue Stake', color: '#4c8fbd' },
  6: { name: 'Purple Stake', color: '#7d5bbe' },
  7: { name: 'Orange Stake', color: '#e08e3c' },
  8: { name: 'Gold Stake', color: '#e0b13c' },
};

// ---- Rulesets / gamemodes -------------------------------------------------
const RULESETS = {
  ruleset_mp_standard: 'Standard',
  ruleset_mp_ranked: 'Ranked',
  ruleset_mp_standard_ranked: 'Standard Ranked',
  ruleset_mp_smallworld: 'Small World',
  ruleset_mp_vanilla: 'Vanilla',
};
const GAMEMODES = {
  gamemode_mp_attrition: 'Attrition',
  gamemode_mp_showdown: 'Showdown',
};

// ---- Card enhancements / editions / seals ---------------------------------
const ENHANCEMENTS = {
  c_base: null,
  m_bonus: 'Bonus',
  m_mult: 'Mult',
  m_wild: 'Wild',
  m_glass: 'Glass',
  m_steel: 'Steel',
  m_stone: 'Stone',
  m_gold: 'Gold',
  m_lucky: 'Lucky',
};
const EDITIONS = {
  none: null,
  base: null,
  foil: 'Foil',
  holo: 'Holographic',
  polychrome: 'Polychrome',
  negative: 'Negative',
};
const EDITION_KEY = { // normalises e_holo -> holo etc.
  e_foil: 'foil', e_holo: 'holo', e_polychrome: 'polychrome', e_negative: 'negative',
};
const SEALS = {
  none: null,
  Red: { name: 'Red Seal', color: '#e35646' },
  Blue: { name: 'Blue Seal', color: '#4c8fbd' },
  Gold: { name: 'Gold Seal', color: '#e0b13c' },
  Purple: { name: 'Purple Seal', color: '#7d5bbe' },
};

const SUITS = {
  S: { name: 'Spades', symbol: '♠', color: '#3a4a63' },
  H: { name: 'Hearts', symbol: '♥', color: '#e0405a' },
  C: { name: 'Clubs', symbol: '♣', color: '#2f7d5b' },
  D: { name: 'Diamonds', symbol: '♦', color: '#e08a3c' },
};
const RANK_NAMES = {
  A: 'A', K: 'K', Q: 'Q', J: 'J', T: '10',
  9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
};

// ---- Locations / blinds ---------------------------------------------------
const BLIND_NAMES = {
  bl_small: 'Small Blind',
  bl_big: 'Big Blind',
  bl_mp_nemesis: 'Nemesis',
  bl_hook: 'The Hook', bl_ox: 'The Ox', bl_house: 'The House', bl_wall: 'The Wall',
  bl_wheel: 'The Wheel', bl_arm: 'The Arm', bl_club: 'The Club', bl_fish: 'The Fish',
  bl_psychic: 'The Psychic', bl_goad: 'The Goad', bl_water: 'The Water',
  bl_window: 'The Window', bl_manacle: 'The Manacle', bl_eye: 'The Eye',
  bl_mouth: 'The Mouth', bl_plant: 'The Plant', bl_serpent: 'The Serpent',
  bl_pillar: 'The Pillar', bl_needle: 'The Needle', bl_head: 'The Head',
  bl_tooth: 'The Tooth', bl_flint: 'The Flint', bl_mark: 'The Mark',
  bl_final_bell: 'Cerulean Bell', bl_final_leaf: 'Verdant Leaf',
  bl_final_vessel: 'Violet Vessel', bl_final_acorn: 'Amber Acorn',
  bl_final_heart: 'Crimson Heart',
};

function titleFromKey(key) {
  return String(key)
    .replace(/^[a-z]_(mp_)?/, '')
    .replace(/^mp_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function jokerName(key) {
  if (!key) return '';
  return JOKER_NAMES[key] || titleFromKey(key);
}
function voucherName(key) {
  return VOUCHER_NAMES[key] || titleFromKey(key);
}
function deckName(back) {
  if (!back) return 'Unknown';
  return DECK_NAMES[back] || back; // most backs already arrive as pretty names
}
function stakeInfo(n) {
  return STAKES[Number(n)] || { name: `Stake ${n}`, color: '#888' };
}
function rulesetName(key) {
  return RULESETS[key] || titleFromKey(key);
}
function gamemodeName(key) {
  return GAMEMODES[key] || titleFromKey(key);
}
function enhancementName(key) {
  if (key in ENHANCEMENTS) return ENHANCEMENTS[key];
  return titleFromKey(key);
}
function editionName(key) {
  const norm = EDITION_KEY[key] || key;
  return EDITIONS[norm] !== undefined ? EDITIONS[norm] : titleFromKey(norm);
}
function normalizeEdition(key) {
  if (!key || key === 'none' || key === 'base') return null;
  return EDITION_KEY[key] || key;
}
function sealInfo(key) {
  if (!key || key === 'none') return null;
  return SEALS[key] || { name: `${key} Seal`, color: '#aaa' };
}

// loc_playing-bl_small  /  loc_shop  /  loc_selecting ...
function locationLabel(loc) {
  if (!loc) return '';
  if (loc === 'loc_shop') return 'Shop';
  if (loc === 'loc_selecting') return 'Blind Select';
  if (loc === 'loc_ready') return 'Ready';
  if (loc === 'loc_round_eval') return 'Cash Out';
  const m = /^loc_playing-(bl_.+)$/.exec(loc);
  if (m) {
    const b = m[1];
    if (b === 'bl_mp_nemesis') return 'Nemesis (PVP)';
    return BLIND_NAMES[b] || titleFromKey(b);
  }
  return titleFromKey(loc.replace(/^loc_/, ''));
}
function blindLabel(blindKey) {
  return BLIND_NAMES[blindKey] || titleFromKey(blindKey);
}

module.exports = {
  JOKER_NAMES, VOUCHER_NAMES, DECK_NAMES, STAKES, RULESETS, GAMEMODES,
  ENHANCEMENTS, EDITIONS, SEALS, SUITS, RANK_NAMES, BLIND_NAMES,
  jokerName, voucherName, deckName, stakeInfo, rulesetName, gamemodeName,
  enhancementName, editionName, normalizeEdition, sealInfo,
  locationLabel, blindLabel, titleFromKey,
};
