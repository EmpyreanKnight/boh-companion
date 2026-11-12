import { ELEMENT_IDS, element, LIBRARIANS, PRINCIPLE_IDS, TIER_THRESHOLD, TREE_LINKS, WISDOM_IDS } from './constants';
import type {
  Assistant, Book, ElementId, Forage, ForageDrop, GameData, Item, PlayerState, PMap, PrincipleId, Recipe, Room, Skill, TreeState, WisdomId,
  Workstation,
} from './types';

// ------------------------------------------------------------------ librarian
export function librarianOf(player: PlayerState) {
  return LIBRARIANS.find((l) => l.id === player.settings.librarian) ?? LIBRARIANS[0];
}
/** The two Elements chosen at the Beginning (Health is always held as well). */
export function startElements(player: PlayerState): ElementId[] {
  const l = librarianOf(player);
  if (!l.choice) return [...l.fixed];
  const v = player.settings.librarianVariant;
  return [...l.fixed, v && l.choice.includes(v) ? v : l.choice[0]];
}

// ------------------------------------------------------------------ cards
export interface Card {
  kind: 'soul' | 'skill' | 'item';
  id: string;            // unique per physical card
  name: string;
  principles: PMap;
  aspects: string[];
  have: boolean;         // the player has it, or can summon it today
  via?: string;          // how the player has it
}

export function skillPrinciples(skill: Skill, level: number): PMap {
  return level > 0 ? { [skill.primary]: level + 1, [skill.secondary]: level } : {};
}
export const power = (m: PMap, p: PrincipleId) => m[p] ?? 0;

export function soulCards(player: PlayerState): Card[] {
  const out: Card[] = [];
  for (const e of ELEMENT_IDS) {
    const counts = player.soul[e] ?? [0, 0, 0, 0];
    counts.forEach((n, lvl) => {
      for (let i = 0; i < n; i++) {
        out.push({ kind: 'soul', id: `${e}:${lvl}:${i}`, name: element(e).name + '+'.repeat(lvl),
          principles: element(e).levels[lvl], aspects: ['Soul'], have: true });
      }
    });
  }
  return out;
}

export function skillCards(data: GameData, player: PlayerState): Card[] {
  const out: Card[] = [];
  for (const s of data.skills) {
    if (s.isLanguage) continue;   // languages only unlock books; they never fill the Skill slot
    const level = player.skills[s.id] ?? 0;
    if (level > 0) {
      out.push({ kind: 'skill', id: s.id, name: `${s.name} (level ${level})`, principles: skillPrinciples(s, level),
        aspects: ['Skill'], have: true });
    }
  }
  return out;
}

/**
 * Everything the player has or can summon today, with how:
 * items marked owned, things lying in unlocked rooms, today's weather, memories from considering
 * things they have, and memories from re-reading mastered books.
 */
export function haveMap(data: GameData, player: PlayerState): Map<string, string> {
  const have = new Map<string, string>();
  const add = (id: string | undefined, via: string) => { if (id && data.itemById[id] && !have.has(id)) have.set(id, via); };
  for (const id of Object.keys(player.itemsOwned)) add(id, 'marked owned');
  if (player.settings.countRoomContents) {
    for (const r of data.rooms) if (player.roomsUnlocked[r.id]) for (const id of r.contents) add(id, `found in ${r.name}`);
  }
  if (player.settings.weather) add(player.settings.weather, "today's weather");
  for (const [id] of [...have]) {
    const it = data.itemById[id];
    if (it?.yieldsMemory) add(data.itemIdByName[it.yieldsMemory], `consider ${it.name}${it.considerDestroys ? ', which uses it up' : ''}`);
  }
  for (const b of data.books) {
    if (player.booksMastered[b.id] && b.memory) add(data.itemIdByName[b.memory], `re-read ${b.name}`);
  }
  return have;
}

export function fitsStation(card: Card, stationPrinciples: PrincipleId[] | null): boolean {
  if (!stationPrinciples) return true;
  return stationPrinciples.some((p) => power(card.principles, p) > 0);
}

/** self = soul card and skill only; have = plus what the player has; max = plus anything in the game. */
export type Band = 'self' | 'have' | 'max';
export const BANDS: { id: Band; name: string; hint: string }[] = [
  { id: 'self', name: 'Soul & skill', hint: 'Your best soul card and skill alone. Costs nothing and repeats every day.' },
  { id: 'have', name: 'With what I have', hint: "Adds today's weather, memories you can call up (by considering things you have or re-reading mastered books), the tools and inks you have, and anything you can craft right now." },
  { id: 'max', name: 'Game maximum', hint: 'Adds the best memory, tool and ink that exist in the game, whether or not you have them. A ceiling, not a plan.' },
];
export interface Pick { slot: string; card: Card | null; value: number }
export interface Solution { total: number; picks: Pick[]; station: Workstation | null }

function best(cards: Card[], p: PrincipleId, used: Set<string>, ok: (c: Card) => boolean): Card | null {
  let top: Card | null = null;
  for (const c of cards) {
    if (used.has(c.id) || !ok(c) || power(c.principles, p) <= 0) continue;
    if (!top || power(c.principles, p) > power(top.principles, p)) top = c;
  }
  return top;
}
/** First card of a list already sorted by falling power that is unused and passes `ok`. */
function first(sorted: Card[], used: Set<string>, ok: (c: Card) => boolean): Card | null {
  for (const c of sorted) if (!used.has(c.id) && ok(c)) return c;
  return null;
}
const bandOk = (band: Band) => (c: Card) => (c.kind !== 'item' ? true : band === 'max' ? true : band === 'have' ? c.have : false);
const NO_CARDS: Card[] = [];

/** Tables that depend on the game data only, built once per data set. */
interface Static {
  orderByP: Record<PrincipleId, number[]>;                 // item indexes carrying the Principle, strongest first
  readingStations: Map<string, Workstation[]>;             // readable aspect -> stations with a slot for it
  recipeStations: Map<string, { station: Workstation; places: Placement[] }[]>;
  recipesByResult: Map<string, Recipe[]>;
}
const staticCache = new WeakMap<GameData, Static>();
function statics(data: GameData): Static {
  let st = staticCache.get(data);
  if (st) return st;
  const orderByP = Object.fromEntries(PRINCIPLE_IDS.map((p) => [p, data.items.map((_, i) => i)
    .filter((i) => power(data.items[i].principles, p) > 0)
    .sort((a, b) => power(data.items[b].principles, p) - power(data.items[a].principles, p) || a - b)])) as Record<PrincipleId, number[]>;
  const readingStations = new Map(['Readable', 'Reel of Film', 'Phonograph Record'].map((aspect) =>
    [aspect, data.workstations.filter((s) => s.slots.some((sl) => sl.includes(aspect)))]));
  const recipeStations: Static['recipeStations'] = new Map();
  const recipesByResult: Static['recipesByResult'] = new Map();
  for (const r of data.recipes) {
    recipeStations.set(r.id, data.workstations.filter((s) => stationQualifies(r, s, data))
      .map((station) => ({ station, places: ingredientPlacements(r, station, data) })));
    recipesByResult.set(r.result, [...(recipesByResult.get(r.result) ?? []), r]);
  }
  st = { orderByP, readingStations, recipeStations, recipesByResult };
  staticCache.set(data, st);
  return st;
}

const CONSIDER: Workstation = { id: 'consider', name: 'Consider (verb)', kind: 'Verb', room: null, principles: [],
  slots: [], evolveVia: [], canCraft: false };
export function stationUnlocked(data: GameData, player: PlayerState, s: Workstation): boolean {
  if (s.id === 'consider' || player.settings.assumeAllStationsUnlocked || player.stationsUnlocked[s.id]) return true;
  const room = data.roomIdByStation[s.id];
  return !!room && !!player.roomsUnlocked[room];
}

export interface Ctx {
  data: GameData; player: PlayerState; souls: Card[]; skills: Card[]; items: Card[];
  have: Map<string, string>;                   // item id -> how the player has it (see haveMap), craftable things included
  crafted: Map<string, string>;                // item id -> recipe id, for things counted only because they can be crafted now
  byP: Record<PrincipleId, Card[]>;            // item cards carrying a Principle, strongest first
  byAspect: Map<string, Card[]>;
  cardById: Map<string, Card>;
  memo: Map<string, unknown>;                  // results of the pure queries below, valid for this context only
}
export function makeCtx(data: GameData, player: PlayerState): Ctx {
  const have = haveMap(data, player);
  const items: Card[] = data.items.map((i) => ({ kind: 'item', id: i.id, name: i.name, principles: i.principles,
    aspects: i.aspects, have: have.has(i.id), via: have.get(i.id) }));
  const st = statics(data);
  const byP = Object.fromEntries(PRINCIPLE_IDS.map((p) => [p, st.orderByP[p].map((i) => items[i])])) as Record<PrincipleId, Card[]>;
  const byAspect = new Map<string, Card[]>();
  for (const c of items) for (const a of c.aspects) { const l = byAspect.get(a); if (l) l.push(c); else byAspect.set(a, [c]); }
  const ctx: Ctx = { data, player, souls: soulCards(player), skills: skillCards(data, player), items, have,
    crafted: new Map(), byP, byAspect, cardById: new Map(items.map((c) => [c.id, c])), memo: new Map() };
  addCraftable(ctx);
  return ctx;
}
function memo<T>(ctx: Ctx, key: string, make: () => T): T {
  if (!ctx.memo.has(key)) ctx.memo.set(key, make());
  return ctx.memo.get(key) as T;
}

/**
 * Count what the player can craft right now as something they have, and the memory from considering it.
 * A crafted thing can be the ingredient of the next recipe, so repeat until nothing more becomes craftable.
 */
function addCraftable(ctx: Ctx) {
  const { data, have } = ctx;
  const mark = (id: string | undefined, via: string) => {
    const card = id ? ctx.cardById.get(id) : undefined;
    if (!card || card.have) return false;
    card.have = true; card.via = via; have.set(card.id, via);
    return true;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const r of data.recipes) {
      if (have.has(r.result)) continue;
      const station = craftableAt(ctx, r);
      if (!station || !mark(r.result, `craft it at ${station.name}`)) continue;
      ctx.crafted.set(r.result, r.id);
      const it = data.itemById[r.result];
      if (it?.yieldsMemory) mark(data.itemIdByName[it.yieldsMemory], `craft and consider ${it.name}`);
      changed = true;
    }
  }
}

// ------------------------------------------------------------------ reading
function bookAspect(type: string): string {
  return type === 'Reel of Film' ? 'Reel of Film' : type === 'Phonograph Record' ? 'Phonograph Record' : 'Readable';
}

/** Best total of principle `p` when reading something of `type` (default: an ordinary text). */
export function bestReading(ctx: Ctx, p: PrincipleId, band: Band, type = 'Codex'): Solution {
  const aspect = bookAspect(type);
  return memo(ctx, `read:${p}|${band}|${aspect}`, () => solveReading(ctx, p, band, aspect));
}
function solveReading(ctx: Ctx, p: PrincipleId, band: Band, aspect: string): Solution {
  const stations = statics(ctx.data).readingStations.get(aspect)!.filter((s) => stationUnlocked(ctx.data, ctx.player, s));
  if (aspect === 'Readable') stations.push(CONSIDER);
  const items = band === 'self' ? NO_CARDS : ctx.byP[p];
  let top: Solution = { total: 0, picks: [], station: null };
  for (const s of stations) {
    const sp = s.id === 'consider' ? null : s.principles;
    const used = new Set<string>();
    const picks: Pick[] = [];
    const take = (slot: string, c: Card | null) => {
      if (c) used.add(c.id);
      picks.push({ slot, card: c, value: c ? power(c.principles, p) : 0 });
    };
    take('Soul', best(ctx.souls, p, used, (c) => fitsStation(c, sp)));
    take('Skill', best(ctx.skills, p, used, (c) => fitsStation(c, sp)));
    const okBand = bandOk(band);
    take('Memory', first(items, used, (c) => c.aspects.includes('Memory') && okBand(c)));
    const bookSlot = s.slots.findIndex((sl) => sl.includes(aspect));
    s.slots.forEach((sl, i) => {
      if (i === bookSlot) return;
      take(sl.join(' / '), first(items, used, (c) => okBand(c) && hasAspect(c.aspects, sl)));
    });
    const total = picks.reduce((a, b) => a + b.value, 0);
    if (!top.station || total > top.total) top = { total, picks, station: s };
  }
  return top;
}

export function knowsLanguage(player: PlayerState, book: Book): boolean {
  return !book.language || (player.skills[book.language] ?? 0) > 0;
}

export interface ReadingRow {
  principle: PrincipleId;
  bands: Record<Band, Solution>;
  unlocked: Record<Band, Book[]>;   // unread, readable books at each band
  near: { book: Book; missing: number; needsLanguage: boolean }[];
}
const BAND_IDS: Band[] = ['self', 'have', 'max'];
export function readingTable(ctx: Ctx): ReadingRow[] {
  return memo(ctx, 'readingTable', () => buildReadingTable(ctx));
}
function buildReadingTable(ctx: Ctx): ReadingRow[] {
  const get = (p: PrincipleId, band: Band, type: string) => bestReading(ctx, p, band, type);
  return PRINCIPLE_IDS.map((p) => {
    const bands = { self: get(p, 'self', 'Codex'), have: get(p, 'have', 'Codex'), max: get(p, 'max', 'Codex') };
    const unlocked: Record<Band, Book[]> = { self: [], have: [], max: [] };
    const near: ReadingRow['near'] = [];
    for (const b of ctx.data.books) {
      if (b.principle !== p || ctx.player.booksMastered[b.id]) continue;
      const lang = knowsLanguage(ctx.player, b);
      for (const band of BAND_IDS) if (lang && get(p, band, b.type).total >= b.mystery) unlocked[band].push(b);
      const missing = b.mystery - get(p, 'have', b.type).total;
      if ((missing > 0 && missing <= 3) || (missing <= 0 && !lang)) near.push({ book: b, missing: Math.max(0, missing), needsLanguage: !lang });
    }
    near.sort((a, b) => a.missing - b.missing || a.book.mystery - b.book.mystery);
    return { principle: p, bands, unlocked, near };
  });
}

export function canReadBook(ctx: Ctx, book: Book): { band: Band | null; solution: Solution; language: boolean } {
  const language = knowsLanguage(ctx.player, book);
  let last = bestReading(ctx, book.principle, 'max', book.type);
  for (const band of BAND_IDS) {
    const s = bestReading(ctx, book.principle, band, book.type);
    last = s;
    if (s.total >= book.mystery) return { band: language ? band : null, solution: s, language };
  }
  return { band: null, solution: last, language };
}

// ------------------------------------------------------------------ recipes
export type RecipeStatus = 'ready' | 'items' | 'blocked';
export interface StationPlan {
  station: Workstation;
  status: RecipeStatus;
  unlocked: boolean;
  totals: Record<Band, number>;
  picks: Pick[];                 // picks for the band that decided the status
  gaps: string[];
}

function hasAspect(aspects: string[], accepts: string[]) { return aspects.some((a) => accepts.includes(a)); }
type Placement = number | 'memory' | 'station' | 'none';

const companionCache = new WeakMap<GameData, Map<string, string[]>>();
function companions(data: GameData, aspect: string): string[] {
  let m = companionCache.get(data);
  if (!m) { m = new Map(); companionCache.set(data, m); }
  if (!m.has(aspect)) {
    const set = new Set<string>([aspect]);
    for (const i of data.items) if (i.aspects.includes(aspect)) i.aspects.forEach((a) => set.add(a));
    set.delete('Thing');
    m.set(aspect, [...set]);
  }
  return m.get(aspect)!;
}

/** Slots where the ingredient may go: 'memory', a slot index, or 'station' (satisfied by the station itself). */
function ingredientPlacements(recipe: Recipe, s: Workstation, data: GameData): Placement[] {
  const ing = recipe.ingredient;
  if (!ing) return ['none'];
  // an item carrying the wanted aspect can enter a slot through any of its aspects (an Egg is also Sustenance)
  const aspects = ing.item ? data.itemById[ing.item]?.aspects ?? [] : companions(data, ing.aspect!);
  const out: (number | 'memory' | 'station')[] = [];
  if (ing.aspect === 'Instrument' && s.kind === 'Instrument') out.push('station');
  if (aspects.includes('Memory')) out.push('memory');
  s.slots.forEach((sl, i) => { if (hasAspect(aspects, sl)) out.push(i); });
  return out;
}

/**
 * A station can host a recipe when one of the recipe's skills shares a Principle with it and the ingredient
 * fits a slot. The station need not carry the recipe's own Principle: that total comes from the cards placed.
 */
export function stationQualifies(recipe: Recipe, s: Workstation, data: GameData): boolean {
  if (!s.canCraft) return false;
  const skillFits = recipe.skills.some((id) => {
    const sk = data.skillById[id];
    return sk && (s.principles.includes(sk.primary) || s.principles.includes(sk.secondary));
  });
  return skillFits && ingredientPlacements(recipe, s, data).length > 0;
}

interface RecipeSolution { total: number; picks: Pick[]; skill: boolean; ingredient: boolean }
function solveRecipe(ctx: Ctx, recipe: Recipe, s: Workstation, places: Placement[], band: Band): RecipeSolution {
  const p = recipe.principle;
  const okBand = bandOk(band);
  const skills = ctx.skills.filter((c) => recipe.skills.includes(c.id));
  const items = band === 'self' ? NO_CARDS : ctx.byP[p];
  let top: RecipeSolution = { total: -1, picks: [], skill: false, ingredient: false };
  for (const place of places) {
    const used = new Set<string>();
    const picks: Pick[] = [];
    const take = (slot: string, c: Card | null) => {
      if (c) used.add(c.id);
      picks.push({ slot, card: c, value: c ? power(c.principles, p) : 0 });
      return c;
    };
    // the ingredient first: it is mandatory and takes its slot
    let ingOk = place === 'none' || place === 'station';
    if (place === 'memory' || typeof place === 'number') {
      const ing = recipe.ingredient!;
      const pool = ing.item ? [ctx.cardById.get(ing.item)].filter((c): c is Card => !!c) : ctx.byAspect.get(ing.aspect!) ?? NO_CARDS;
      const ok = (c: Card) => (place === 'memory' ? c.aspects.includes('Memory') : hasAspect(c.aspects, s.slots[place]))
        && (band === 'max' ? true : c.have);
      ingOk = !!take(`Ingredient (${ing.label})`, best(pool, p, used, ok) ?? pool.find(ok) ?? null);
    }
    take('Soul', best(ctx.souls, p, used, (c) => fitsStation(c, s.principles)));
    const fitsSkill = (c: Card) => !used.has(c.id) && fitsStation(c, s.principles);
    const sk = take('Skill', best(skills, p, used, fitsSkill) ?? skills.find(fitsSkill) ?? null);
    if (place !== 'memory') take('Memory', first(items, used, (c) => c.aspects.includes('Memory') && okBand(c)));
    s.slots.forEach((sl, i) => {
      if (i === place) return;
      // an extra slot asks only for a kind of card; the card need not share a Principle with the station
      const soul = sl.includes('Soul') ? best(ctx.souls, p, used, () => true) : null;
      const item = first(items, used, (c) => okBand(c) && hasAspect(c.aspects, sl));
      take(sl.join(' / '), item && (!soul || power(item.principles, p) > power(soul.principles, p)) ? item : soul);
    });
    const total = picks.reduce((a, b) => a + b.value, 0);
    const score = total + (ingOk ? 1000 : 0) + (sk ? 500 : 0);
    if (score > top.total + (top.ingredient ? 1000 : 0) + (top.skill ? 500 : 0) || top.total < 0) {
      top = { total, picks, skill: !!sk, ingredient: ingOk };
    }
  }
  return top;
}

/** Helpers who can be hired in a season: seasonal workers only in their own, and nobody at all during Numa. */
export function helpersIn(data: GameData, season: string): Assistant[] {
  if (season === 'Numa') return [];
  return data.assistants.filter((a) => !a.season || !season || a.season === season);
}

/** The first unlocked station where the recipe works with what the player has, or null. */
function craftableAt(ctx: Ctx, recipe: Recipe): Workstation | null {
  const need = TIER_THRESHOLD[recipe.tier];
  for (const { station, places } of statics(ctx.data).recipeStations.get(recipe.id) ?? []) {
    if (!stationUnlocked(ctx.data, ctx.player, station)) continue;
    const have = solveRecipe(ctx, recipe, station, places, 'have');
    if (have.skill && have.ingredient && have.total >= need) return station;
  }
  return null;
}

export function planRecipe(ctx: Ctx, recipe: Recipe): StationPlan[] {
  return memo(ctx, `plan:${recipe.id}`, () => buildPlans(ctx, recipe));
}
function buildPlans(ctx: Ctx, recipe: Recipe): StationPlan[] {
  const need = TIER_THRESHOLD[recipe.tier];
  const plans: StationPlan[] = [];
  for (const { station: s, places } of statics(ctx.data).recipeStations.get(recipe.id) ?? []) {
    const self = solveRecipe(ctx, recipe, s, places, 'self');
    const have = solveRecipe(ctx, recipe, s, places, 'have');
    const max = solveRecipe(ctx, recipe, s, places, 'max');
    const unlocked = stationUnlocked(ctx.data, ctx.player, s);
    const gaps: string[] = [];
    if (!unlocked) gaps.push('station locked');
    if (!have.skill) gaps.push('no owned skill from the list fits this station');
    if (!have.ingredient) gaps.push(`needs ${recipe.ingredient!.label}`);
    let status: RecipeStatus = 'blocked';
    let picks = have.picks;
    if (!gaps.length && self.total >= need && self.ingredient) { status = 'ready'; picks = self.picks; }
    else if (!gaps.length && have.total >= need) status = 'items';
    else if (have.total < need) {
      gaps.push(`needs ${need - have.total} more ${recipe.principle}` + (max.total >= need ? ' (reachable with things you do not have yet)' : ''));
    }
    plans.push({ station: s, status, unlocked, totals: { self: self.total, have: have.total, max: max.total }, picks, gaps });
  }
  const rank = { ready: 0, items: 1, blocked: 2 };
  return plans.sort((a, b) => rank[a.status] - rank[b.status] || b.totals.have - a.totals.have || a.station.name.localeCompare(b.station.name));
}

/** Display order: what can be made now first, then with my items, then blocked. */
export const STATUS_RANK: Record<RecipeStatus | 'nowhere', number> = { ready: 0, items: 1, blocked: 2, nowhere: 3 };
export function recipeStatus(ctx: Ctx, recipe: Recipe): RecipeStatus | 'nowhere' {
  const plans = planRecipe(ctx, recipe);
  return plans.length ? plans[0].status : 'nowhere';
}

export type CraftState = 'have' | 'craftable' | 'blocked';
export interface CraftRow { item: Item; state: CraftState; recipe: Recipe; via?: string; gap?: string }
/** Every thing that has a recipe: already held, craftable right now, or what its closest recipe still lacks. */
export function craftList(ctx: Ctx): CraftRow[] {
  return memo(ctx, 'craftList', () => {
    const rank = { ready: 0, items: 1, blocked: 2, nowhere: 3 };
    const rows: CraftRow[] = [];
    for (const [id, recipes] of statics(ctx.data).recipesByResult) {
      const item = ctx.data.itemById[id];
      if (!item) continue;
      const via = ctx.have.get(id);
      const made = ctx.crafted.get(id);
      const recipe = recipes.find((r) => r.id === made)
        ?? [...recipes].sort((a, b) => rank[recipeStatus(ctx, a)] - rank[recipeStatus(ctx, b)])[0];
      if (made) rows.push({ item, state: 'craftable', recipe, via });
      else if (via) rows.push({ item, state: 'have', recipe, via });
      else rows.push({ item, state: 'blocked', recipe, gap: planRecipe(ctx, recipe)[0]?.gaps.join('; ') || 'no station known' });
    }
    return rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
  });
}

// ------------------------------------------------------------------ helpers and rooms
/** Card categories every helper accepts. Boosts stack across categories; each category counts once per day. */
export const HELPER_CATEGORIES = ['Soul', 'Beverage', 'Memory', 'Sustenance', 'Tool'] as const;
export interface HelperPlan { assistant: Assistant; principle: PrincipleId; total: number; base: number; picks: Pick[] }

/** Cards usable to boost helpers: what the player has, which includes what they can craft right now. */
export function helperPool(ctx: Ctx): Card[] {
  return memo(ctx, 'helperPool', () => ctx.items.filter((c) => c.have));
}

export function helperBest(ctx: Ctx, pool: Card[], a: Assistant, p: PrincipleId): HelperPlan {
  const cats: string[] = [...HELPER_CATEGORIES, ...(a.unique ? [a.unique] : [])];
  // top few candidates per category, then the best assignment with no card used twice
  const options = cats.map((cat) => {
    const cards = cat === 'Soul' ? ctx.souls : pool.filter((c) => c.aspects.includes(cat));
    const sorted = cards.filter((c) => power(c.principles, p) > 0).sort((x, y) => power(y.principles, p) - power(x.principles, p));
    const seen = new Set<string>();
    return sorted.filter((c) => { const k = cat === 'Soul' ? c.name : c.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, cats.length);
  });
  let bestSum = -1; let bestPick: (Card | null)[] = [];
  const cur: (Card | null)[] = [];
  const used = new Set<string>();
  const walk = (i: number, sum: number) => {
    if (i === cats.length) { if (sum > bestSum) { bestSum = sum; bestPick = [...cur]; } return; }
    for (const c of options[i]) {
      if (used.has(c.id)) continue;
      used.add(c.id); cur.push(c); walk(i + 1, sum + power(c.principles, p)); cur.pop(); used.delete(c.id);
    }
    cur.push(null); walk(i + 1, sum); cur.pop();
  };
  walk(0, 0);
  const base = power(a.principles, p);
  const picks = cats.map((cat, i) => ({ slot: cat === a.unique ? `${cat} (unique to them)` : cat, card: bestPick[i] ?? null,
    value: bestPick[i] ? power(bestPick[i]!.principles, p) : 0 }));
  return { assistant: a, principle: p, total: base + Math.max(0, bestSum), base, picks };
}

export type RoomState = 'unlocked' | 'openable' | 'short' | 'special' | 'beyond';
export interface RoomStatus { room: Room; state: RoomState; plan: HelperPlan | null; need: number; missing: number;
  card?: { card: Card | null; principle: PrincipleId; value: number } }   // for rooms opened with a card, not a helper

export function prerequisiteMet(player: PlayerState, room: Room): boolean {
  return room.openedFrom.length === 0 || room.openedFrom.some((id) => player.roomsUnlocked[id]);
}

export function roomStatuses(ctx: Ctx, assistants: Assistant[]): RoomStatus[] {
  return memo(ctx, `rooms:${assistants.map((a) => a.id).join(',')}`, () => buildRoomStatuses(ctx, assistants));
}
function buildRoomStatuses(ctx: Ctx, assistants: Assistant[]): RoomStatus[] {
  const pool = helperPool(ctx);
  const cache = new Map<string, HelperPlan>();
  const plan = (a: Assistant, p: PrincipleId) => {
    const k = a.id + p;
    if (!cache.has(k)) cache.set(k, helperBest(ctx, pool, a, p));
    return cache.get(k)!;
  };
  return ctx.data.rooms.map((room) => {
    if (ctx.player.roomsUnlocked[room.id]) return { room, state: 'unlocked' as RoomState, plan: null, need: 0, missing: 0 };
    const reqs = Object.entries(room.requires) as [PrincipleId, number][];
    const pre = prerequisiteMet(ctx.player, room);
    if (!reqs.length || room.opener === 'Item' || room.opener === 'Circumstance') {
      return { room, state: (pre ? 'special' : 'beyond') as RoomState, plan: null, need: 0, missing: 0 };
    }
    if (room.opener !== 'Assistance') {
      // opened by placing one card with the right aspect, enough of one of the Principles and all of requiresAlso
      const also = Object.entries(room.requiresAlso) as [PrincipleId, number][];
      const lacks = (c: Card | null, p: PrincipleId, n: number) =>
        Math.max(0, n - (c ? power(c.principles, p) : 0)) + also.reduce((sum, [q, m]) => sum + Math.max(0, m - (c ? power(c.principles, q) : 0)), 0);
      const fits = pool.filter((c) => c.aspects.includes(room.opener) && !(room.openerForbids && c.aspects.includes(room.openerForbids)));
      let top = { card: null as Card | null, principle: reqs[0][0], value: 0 }, need = reqs[0][1], missing = lacks(null, ...reqs[0]);
      for (const [p, n] of reqs) for (const c of fits) {
        if (lacks(c, p, n) < missing) { top = { card: c, principle: p, value: power(c.principles, p) }; need = n; missing = lacks(c, p, n); }
      }
      return { room, state: (!pre ? 'beyond' : missing === 0 ? 'openable' : 'short') as RoomState, plan: null, need, missing, card: top };
    }
    let top: { plan: HelperPlan; need: number; missing: number } | null = null;
    for (const [p, need] of reqs) for (const a of assistants) {
      const pl = plan(a, p);
      const missing = Math.max(0, need - pl.total);
      // among equally good attempts prefer the cheaper helper, then the fewest boost cards
      const cost = (x: HelperPlan, n: number) => x.assistant.fee * 10 + trimPlan(x, n).length;
      if (!top || missing < top.missing || (missing === top.missing && cost(pl, need) < cost(top.plan, top.need))) {
        top = { plan: pl, need, missing };
      }
    }
    const state: RoomState = !pre ? 'beyond' : top && top.missing === 0 ? 'openable' : 'short';
    return { room, state, plan: top?.plan ?? null, need: top?.need ?? 0, missing: top?.missing ?? 0 };
  });
}

/** Trim a helper plan to the fewest boosts that still reach `need` (largest boosts first). */
export function trimPlan(plan: HelperPlan, need: number): Pick[] {
  const sorted = plan.picks.filter((k) => k.card).sort((a, b) => b.value - a.value);
  const out: Pick[] = [];
  let sum = plan.base;
  for (const k of sorted) { if (sum >= need) break; out.push(k); sum += k.value; }
  return out;
}

// ------------------------------------------------------------------ foraging
export interface ForageRow {
  spot: Forage; room: Room | null;
  available: boolean;                                   // its room is unlocked, or it lies outside the house
  elements: { id: ElementId; held: boolean }[];         // Elements of the Soul the place accepts
  needsSkill: boolean;
  skills: { skill: Skill; level: number }[];            // Skills it accepts, the ones the player has first
  ready: boolean;                                       // available, with a fitting Element and (if needed) Skill in hand
  drops: ForageDrop[];                                  // what it yields in the season, likeliest first; all drops when no season
}
/** Foraging places with what they accept and yield. Card strength does not matter, only a shared Principle. */
export function forageRows(data: GameData, player: PlayerState, season: string): ForageRow[] {
  // places I can use now first, then reachable ones I lack a card for, then locked ones
  const rank = (r: ForageRow) => (r.ready ? 0 : r.available ? 1 : 2);
  return data.foraging.map((spot): ForageRow => {
    const room = spot.room ? data.roomById[spot.room] ?? null : null;
    const available = !room || !!player.roomsUnlocked[room.id];
    const elements = (spot.soulElements ?? ELEMENT_IDS.filter((e) => spot.soulPrinciples.some((p) => power(element(e).levels[0], p) > 0)))
      .map((id) => ({ id, held: (player.soul[id] ?? []).some((n) => n > 0) }));
    const needsSkill = spot.skillPrinciples.length > 0;
    // a language adds no Principles, so it never fits
    const skills = data.skills.filter((s) => !s.isLanguage && (spot.skillPrinciples.includes(s.primary) || spot.skillPrinciples.includes(s.secondary)))
      .map((skill) => ({ skill, level: player.skills[skill.id] ?? 0 })).sort((a, b) => b.level - a.level);
    const ready = available && (!elements.length || elements.some((e) => e.held)) && (!needsSkill || skills.some((s) => s.level > 0));
    const drops = season ? spot.drops.filter((d) => d.chance[season] != null).sort((a, b) => b.chance[season] - a.chance[season]) : spot.drops;
    return { spot, room, available, elements, needsSkill, skills, ready, drops };
  }).sort((a, b) => rank(a) - rank(b));
}

// ------------------------------------------------------------------ tree
export const emptyTree = (): TreeState =>
  Object.fromEntries(WISDOM_IDS.map((w) => [w, Array(9).fill(null)])) as TreeState;
export const nodeKey = (w: WisdomId, level: number) => `${w}:${level}`;

export function neighbours(w: WisdomId, level: number): [WisdomId, number][] {
  const out: [WisdomId, number][] = [];
  if (level > 1) out.push([w, level - 1]);
  if (level < 9) out.push([w, level + 1]);
  for (const [a, b] of TREE_LINKS) {
    if (a[0] === w && a[1] === level) out.push(b);
    if (b[0] === w && b[1] === level) out.push(a);
  }
  return out;
}
export const filled = (tree: TreeState, w: WisdomId, level: number) => tree[w]?.[level - 1] ?? null;

/**
 * A first node is reachable once the journal is committed at the root; any other node when a neighbouring
 * node (same branch or flying line) is filled.
 */
export function reachable(tree: TreeState, w: WisdomId, level: number, journal = true): boolean {
  return level === 1 ? journal : neighbours(w, level).some(([nw, nl]) => !!filled(tree, nw, nl));
}

export function placement(tree: TreeState): Record<string, { wisdom: WisdomId; level: number }> {
  const out: Record<string, { wisdom: WisdomId; level: number }> = {};
  for (const w of WISDOM_IDS) tree[w].forEach((s, i) => { if (s) out[s] = { wisdom: w, level: i + 1 }; });
  return out;
}

export const elementFor = (skill: Skill, w: WisdomId): ElementId | null =>
  skill.commit.find((c) => c.wisdom === w)?.element ?? null;

export type PickerGroup = 'applicable' | 'plan' | 'elsewhere';
export interface PickerRow { skill: Skill; group: PickerGroup; element: ElementId; otherWisdom: WisdomId; otherElement: ElementId;
  level: number; where?: { wisdom: WisdomId; level: number } }

export function pickerRows(data: GameData, player: PlayerState, w: WisdomId, level: number): PickerRow[] {
  const placed = placement(player.tree);
  const rows: PickerRow[] = [];
  for (const s of data.skills) {
    const el = elementFor(s, w);
    if (!el) continue;
    const other = s.commit.find((c) => c.wisdom !== w)!;
    const lvl = player.skills[s.id] ?? 0;
    const where = placed[s.id];
    if (where && where.wisdom === w && where.level === level) continue;
    const group: PickerGroup = where ? 'elsewhere' : lvl >= level ? 'applicable' : 'plan';
    rows.push({ skill: s, group, element: el, otherWisdom: other.wisdom, otherElement: other.element, level: lvl, where });
  }
  const rank = { applicable: 0, plan: 1, elsewhere: 2 };
  return rows.sort((a, b) => rank[a.group] - rank[b.group] || b.level - a.level || a.skill.name.localeCompare(b.skill.name));
}

/** Filled nodes that cannot be reached from any filled first node (an invalid tree has some). */
export function stranded(tree: TreeState): { wisdom: WisdomId; level: number }[] {
  const seen = new Set<string>();
  const queue: [WisdomId, number][] = [];
  for (const w of WISDOM_IDS) if (filled(tree, w, 1)) { queue.push([w, 1]); seen.add(nodeKey(w, 1)); }
  while (queue.length) {
    const [w, l] = queue.pop()!;
    for (const [nw, nl] of neighbours(w, l)) {
      if (filled(tree, nw, nl) && !seen.has(nodeKey(nw, nl))) { seen.add(nodeKey(nw, nl)); queue.push([nw, nl]); }
    }
  }
  const out: { wisdom: WisdomId; level: number }[] = [];
  for (const w of WISDOM_IDS) for (let l = 1; l <= 9; l++) if (filled(tree, w, l) && !seen.has(nodeKey(w, l))) out.push({ wisdom: w, level: l });
  return out;
}

export interface TreeIssue { wisdom: WisdomId; level: number; skill: string; problem: string }
export function treeIssues(data: GameData, tree: TreeState, levels?: Record<string, number>, journal = true): TreeIssue[] {
  const issues: TreeIssue[] = [];
  const seen = new Set<string>();
  for (const w of WISDOM_IDS) tree[w].forEach((id, i) => {
    if (!id) return;
    const s = data.skillById[id];
    const add = (problem: string) => issues.push({ wisdom: w, level: i + 1, skill: id, problem });
    if (!s) return add('unknown skill');
    if (!elementFor(s, w)) add('skill cannot be committed to this Wisdom');
    if (seen.has(id)) add('skill committed twice');
    seen.add(id);
    if (levels && (levels[id] ?? 0) < i + 1) add(`skill is level ${levels[id] ?? 0}, node needs level ${i + 1}`);
    if (i === 0 && !journal) add('the journal is not committed at the root, so the Tree is still closed');
  });
  for (const n of stranded(tree)) issues.push({ ...n, skill: filled(tree, n.wisdom, n.level)!, problem: 'not reachable from a first node' });
  return issues;
}

export interface ElementStat { element: ElementId; start: number; fromTree: number; base: number; attuned: number;
  hand: number[]; bestLevel: number }
export interface TreeStats { elements: ElementStat[]; committed: number; perWisdom: Record<WisdomId, number>;
  bestPerPrinciple: PMap; sumPerPrinciple: PMap }

/** Merge pairs upward while attuned skills remain: each evolution uses one skill attuned to that element. */
export function evolve(base: number, attuned: number): number[] {
  const hand = [base, 0, 0, 0];
  let ev = attuned;
  for (let lvl = 0; lvl < 3; lvl++) {
    while (hand[lvl] >= 2 && ev > 0) { hand[lvl] -= 2; hand[lvl + 1] += 1; ev--; }
  }
  return hand;
}

export function treeStats(data: GameData, tree: TreeState, start: ElementId[], evolveAll: boolean, journal: ElementId | null = null): TreeStats {
  const fromTree = Object.fromEntries(ELEMENT_IDS.map((e) => [e, 0])) as Record<ElementId, number>;
  const perWisdom = Object.fromEntries(WISDOM_IDS.map((w) => [w, 0])) as Record<WisdomId, number>;
  let committed = 0;
  for (const w of WISDOM_IDS) for (const id of tree[w]) {
    if (!id) continue;
    const el = data.skillById[id] && elementFor(data.skillById[id], w);
    if (el) { fromTree[el]++; perWisdom[w]++; committed++; }
  }
  const bestPerPrinciple: PMap = {}, sumPerPrinciple: PMap = {};
  const elements = ELEMENT_IDS.map((e) => {
    const st = (e === 'health' ? 1 : 0) + start.filter((s) => s === e).length + (journal === e ? 1 : 0);
    const base = st + fromTree[e];
    const hand = evolveAll ? evolve(base, fromTree[e]) : [base, 0, 0, 0];
    let bestLevel = -1;
    hand.forEach((n, lvl) => {
      if (!n) return;
      bestLevel = lvl;
      for (const [p, v] of Object.entries(element(e).levels[lvl]) as [PrincipleId, number][]) {
        bestPerPrinciple[p] = Math.max(bestPerPrinciple[p] ?? 0, v);
        sumPerPrinciple[p] = (sumPerPrinciple[p] ?? 0) + v * n;
      }
    });
    return { element: e, start: st, fromTree: fromTree[e], base, attuned: fromTree[e], hand, bestLevel };
  });
  return { elements, committed, perWisdom, bestPerPrinciple, sumPerPrinciple };
}
