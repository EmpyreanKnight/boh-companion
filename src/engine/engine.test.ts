import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMemory, TREE_LINKS, WISDOM_IDS } from './constants';
import { indexData } from './data';
import { defaultPlayer } from './defaults';
import {
  bestReading, canReadBook, craftList, evolve, forageRows, helperBest, helpersIn, helperPool, makeCtx, memorySources, neighbours, planRecipe, reachable, roomStatuses,
  startElements, stationQualifies, stranded, treeIssues, treeStats, emptyTree, upgradePlan,
} from './engine';
import { PRESETS } from './presets';
import { exportState, migrate, usePlayer } from '../store';
import { LIBRARIANS } from './constants';

const read = (n: string) => JSON.parse(readFileSync(new URL(`../../public/data/${n}.json`, import.meta.url), 'utf8'));
const data = indexData({ skills: read('skills'), books: read('books'), items: read('items'),
  workstations: read('workstations'), recipes: read('recipes'), manifest: read('manifest'),
  rooms: read('rooms'), assistants: read('assistants'), foraging: read('foraging'), caches: read('caches') });

describe('data', () => {
  it('has the expected tables', () => {
    expect(data.skills).toHaveLength(73);
    expect(data.skills.filter((s) => s.isLanguage)).toHaveLength(10);
    expect(data.books.length).toBeGreaterThan(270);
    expect(data.recipes.length).toBeGreaterThan(130);
  });
  it('items, skills, workstations, rooms and caches carry their in-game description', () => {
    for (const list of [data.items, data.skills, data.workstations, data.rooms, data.caches]) {
      for (const x of list) expect(x.description, x.name).toBeTruthy();
    }
    expect(data.itemById['sand'].description).toBe('An hourglass, of course, is sand contained by sand.');
    // a room has two texts: under its locked name, and once unlocked
    for (const r of data.rooms) { expect(r.lockedDescription, r.name).toBeTruthy(); expect(r.lockedDescription).not.toBe(r.description); }
    expect(data.roomById['keepers-lodge'].lockedDescription).toMatch(/^A cottage where Hush House's groundskeeper lived/);
    expect(data.roomById['keepers-lodge'].description).toMatch(/^For five hundred years/);
    expect(data.itemById['memory-sight'].description).toBe('The eye sees more than the heart knows. (Blake)');
    for (const b of data.books) { expect(b.description, b.name).toBeTruthy(); }
    // the texts shown on starting a book and on mastering it, each distinct from the description
    for (const b of data.books) {
      for (const t of [b.reading, b.read]) { expect(t, b.name).toBeTruthy(); expect(t).not.toBe(b.description); expect(t).not.toMatch(/\[\[|\{\{|\|/); }
      expect(b.reading, b.name).not.toBe(b.read);
    }
    expect(data.bookById['key-of-night'].reading).toMatch(/^The Worms, all of whom use grandiose/);
    expect(data.bookById['key-of-night'].read).toMatch(/^The Worms identify the Wheel/);
    for (const x of data.items) expect(x.description).not.toMatch(/\[\[|\]\]|[{}|<>]|''/);   // no wiki markup left over
  });
  it('every skill carries the text shown on committing it to each of its Wisdoms', () => {
    for (const s of data.skills) for (const c of s.commit) {
      expect(c.text, `${s.name} / ${c.wisdom}`).toBeTruthy();
      expect(c.title, `${s.name} / ${c.wisdom}`).toBeTruthy();
    }
    const sharps = data.skillById['sharps'].commit.find((c) => c.wisdom === 'hushery')!;
    expect(sharps.title).toBe('A Wound in Dreams');
    expect(sharps.text).toMatch(/^Before speech, we could not dream.*Hushery recognises this truth\.$/);
    expect(Object.keys(sharps).sort()).toEqual(['element', 'text', 'title', 'wisdom']);   // game text only, no wiki commentary
    // on this page the second paragraph comes before its quote
    expect(data.skillById['edicts-inviolable'].commit.find((c) => c.wisdom === 'horomachistry')!.title).toBe('Fire');
  });
  it('every skill has two distinct wisdoms and every reference resolves', () => {
    for (const s of data.skills) {
      expect(s.commit).toHaveLength(2);
      expect(s.commit[0].wisdom).not.toBe(s.commit[1].wisdom);
      for (const c of s.commit) expect(WISDOM_IDS).toContain(c.wisdom);
    }
    for (const b of data.books) if (b.lesson) expect(data.skillById[b.lesson.skill]).toBeTruthy();
    for (const r of data.recipes) for (const id of r.skills) expect(data.skillById[id]).toBeTruthy();
  });
  it('every recipe can be made at some workstation', () => {
    const hosts = (id: string) => data.workstations.filter((s) => stationQualifies(data.recipes.find((r) => r.id === id)!, s, data)).map((s) => s.name);
    expect(data.recipes.filter((r) => !data.workstations.some((s) => stationQualifies(r, s, data)))).toEqual([]);
    // a station need not carry the recipe's Principle: the wiki names exactly these two for Gervinite through Sky
    expect(hosts('gervinite--sky-scholar')).toEqual(["Alchemist's Glassware", 'Oubliette Containment']);
    // an Egg enters a kitchen range as Sustenance
    expect(hosts('living-relic--sky-scholar')).toContain('Kitchen Range: Servants');
  });
});

describe('reading', () => {
  it('base Shapt plus level 1 Door & Wall masters a Knock 4 book (wiki example)', () => {
    const p = defaultPlayer();
    p.soul.shapt = [1, 0, 0, 0];
    p.skills['door-and-wall'] = 1;
    const ctx = makeCtx(data, p);
    expect(bestReading(ctx, 'knock', 'self').total).toBe(4);
    const book = data.books.find((b) => b.name === 'Advice on Containment');
    if (book) expect(canReadBook(ctx, book).band).toBe('self');
  });
  it('a language never fills the skill slot, and a foreign book needs its language', () => {
    const p = defaultPlayer();
    p.soul = { ...p.soul, shapt: [0, 0, 0, 0], phost: [0, 0, 0, 0], health: [0, 0, 0, 0] };
    p.skills['fucine'] = 9;
    const ctx = makeCtx(data, p);
    for (const pr of ['edge', 'forge', 'winter', 'lantern'] as const) expect(bestReading(ctx, pr, 'self').total).toBe(0);
    const foreign = data.books.find((b) => b.language === 'vak')!;
    expect(canReadBook(makeCtx(data, { ...p, skills: { 'door-and-wall': 9 } }), foreign).band).toBeNull();
  });
});

describe('recipes', () => {
  it('Labhitic Tincture is ready with enough Edge and blocked without a skill', () => {
    const r = data.recipes.find((x) => x.resultName === 'Labhitic Tincture')!;
    const p = defaultPlayer();
    p.settings.assumeAllStationsUnlocked = true;     // these tests are about the recipe, not about which rooms are open
    expect(planRecipe(makeCtx(data, p), r).every((x) => x.status === 'blocked')).toBe(true);
    p.skills['edicts-martial'] = 4;          // Moon 5, Edge 4
    p.soul.mettle = [1, 0, 0, 0];            // Forge 2, Edge 1
    const plans = planRecipe(makeCtx(data, p), r);
    expect(plans[0].status).toBe('ready');
    expect(plans[0].totals.self).toBeGreaterThanOrEqual(5);
  });
});

describe('extra slots', () => {
  it('take any card of the right kind, whatever the Principles of the workstation', () => {
    const r = data.recipes.find((x) => x.id === 'living-relic--sky-scholar')!;
    const p = defaultPlayer();                                  // Twice-Born: Health, Shapt, Phost
    p.skills['stitching-and-binding'] = 3;
    p.itemsOwned['hens-egg'] = true;
    p.soul.phost = [0, 0, 0, 1];                                // a strong Sky card that does not fit the altar
    const altar = planRecipe(makeCtx(data, p), r).find((x) => x.station.name === 'Altar: Malachite')!;   // Moth, Nectar, Heart
    const cards = altar.picks.filter((k) => k.card).map((k) => `${k.slot}: ${k.card!.name}`);
    expect(cards.some((c) => c.startsWith('Soul: Phost'))).toBe(false);   // the Soul slot itself must fit the altar
    expect(cards.some((c) => c.includes('Phost') && !c.startsWith('Soul:'))).toBe(true);   // Phost (Lantern, Sky) sits in an extra slot
    expect(cards.some((c) => c.startsWith('Ingredient') && c.includes("Hen's Egg"))).toBe(true);
  });
});

describe('tree', () => {
  it('flying lines are symmetric and join different branches', () => {
    expect(TREE_LINKS).toHaveLength(14);
    for (const [a, b] of TREE_LINKS) {
      expect(a[0]).not.toBe(b[0]);
      expect(neighbours(a[0], a[1])).toContainEqual(b);
      expect(neighbours(b[0], b[1])).toContainEqual(a);
    }
  });
  it('The Bosk 1 opens Skolekosophy 2 and Preservation 5 opens The Bosk 4 (guide statements)', () => {
    const t = emptyTree();
    expect(reachable(t, 'skolekosophy', 2)).toBe(false);
    t['the-bosk'][0] = 'furs-and-feathers';
    expect(reachable(t, 'skolekosophy', 2)).toBe(true);
    const u = emptyTree();
    u.preservation[4] = 'tridesma-hiera';
    expect(reachable(u, 'the-bosk', 4)).toBe(true);
    expect(stranded(u)).toHaveLength(1);
  });
  it('the first nodes open only once the journal is committed at the root', () => {
    const t = emptyTree();
    expect(reachable(t, 'the-bosk', 1, false)).toBe(false);
    expect(reachable(t, 'the-bosk', 1, true)).toBe(true);
    t['the-bosk'][0] = 'furs-and-feathers';
    expect(reachable(t, 'the-bosk', 2, false)).toBe(true);        // further nodes depend on their neighbours only
    expect(treeIssues(data, t, undefined, false).map((i) => i.problem)).toEqual([expect.stringContaining('journal')]);
    expect(treeIssues(data, t, undefined, true)).toEqual([]);
  });
  it('a committed language powers an evolution of its element like any other skill', () => {
    const t = emptyTree();
    const lang = data.skills.find((s) => s.isLanguage)!;
    t[lang.commit[0].wisdom][0] = lang.id;
    const e = treeStats(data, t, [], true).elements.find((x) => x.element === lang.commit[0].element)!;
    expect(e.attuned).toBe(1);
  });
  it.each(PRESETS.map((p) => [p.id, p] as const))('preset %s obeys every tree rule', (_id, preset) => {
    expect(treeIssues(data, preset.tree)).toEqual([]);
    const stats = treeStats(data, preset.tree, [], true);
    expect(stats.committed).toBe(73);
  });
  it.each(['v3'])('preset %s reaches level 9 everywhere with at least 7 evolutions per element', (id) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    for (const w of WISDOM_IDS) expect(preset.tree[w][8]).toBeTruthy();
    for (const e of treeStats(data, preset.tree, [], true).elements) expect(e.attuned).toBeGreaterThanOrEqual(7);
  });
  it('8 cards and 7 skills reach +++', () => {
    expect(evolve(8, 7)).toEqual([0, 0, 0, 1]);
    expect(evolve(5, 3)).toEqual([1, 0, 1, 0]);
    expect(evolve(4, 0)).toEqual([4, 0, 0, 0]);
  });
});

describe('what I have', () => {
  it('weather, room contents, considered objects and re-read books all count', () => {
    const p = defaultPlayer();
    const base = bestReading(makeCtx(data, p), 'grail', 'have').total;
    p.settings.weather = 'rain';                       // Rain: Grail 2, Nectar 2
    expect(bestReading(makeCtx(data, p), 'grail', 'have').total).toBe(base + 2);
    expect(bestReading(makeCtx(data, p), 'grail', 'self').total).toBe(base);
    const q = defaultPlayer();
    q.roomsUnlocked['watchmans-tower-first-floor'] = true;   // holds the Mirrorscope (Lantern 1)
    const ctx = makeCtx(data, q);
    expect(ctx.have.has('mirrorscope')).toBe(true);
    expect(ctx.have.has('memory-sight')).toBe(true);         // from considering the Mirrorscope
    const b = data.books.find((x) => x.memory && data.itemIdByName[x.memory])!;
    const r = defaultPlayer(); r.booksMastered[b.id] = true;
    expect(makeCtx(data, r).have.get(data.itemIdByName[b.memory!])).toContain('re-read');
  });
});

describe('crafting counts as having', () => {
  it("Torgue's Cleansing becomes a memory I can call up once a skill can craft it", () => {
    const p = defaultPlayer();
    p.settings.assumeAllStationsUnlocked = true;     // these tests are about the recipe, not about which rooms are open
    expect(makeCtx(data, p).have.has('torgues-cleansing')).toBe(false);
    expect(craftList(makeCtx(data, p)).find((c) => c.item.id === 'torgues-cleansing')!.state).toBe('blocked');
    p.skills['sharps'] = 4;                                  // Edge 5: Prentice-level Edge
    const ctx = makeCtx(data, p);
    expect(ctx.have.get('torgues-cleansing')).toContain('craft it at');
    expect(ctx.crafted.has('torgues-cleansing')).toBe(true);
    expect(craftList(ctx).find((c) => c.item.id === 'torgues-cleansing')!.state).toBe('craftable');
    // the memory (Edge 2) now counts when reading with what I have, but not for soul & skill alone
    expect(bestReading(ctx, 'edge', 'have').total).toBe(bestReading(ctx, 'edge', 'self').total + 2);
  });
  it('a thing I already hold is listed as held, and crafted things feed later recipes', () => {
    const p = defaultPlayer();
    p.itemsOwned['torgues-cleansing'] = true;
    const row = craftList(makeCtx(data, p)).find((c) => c.item.id === 'torgues-cleansing')!;
    expect(row.state).toBe('have');
    const q = defaultPlayer();
    q.settings.assumeAllStationsUnlocked = true;     // these tests are about the recipe, not about which rooms are open
    for (const s of data.skills) q.skills[s.id] = 9;
    const ctx = makeCtx(data, q);
    const chained = data.recipes.filter((r) => r.ingredient?.item && ctx.crafted.has(r.ingredient.item) && ctx.crafted.get(r.result) === r.id);
    expect(chained.length).toBeGreaterThan(0);
  });
});

describe('foraging', () => {
  it('gathering stations are kept apart from crafting workstations', () => {
    expect(data.foraging).toHaveLength(17);
    for (const f of data.foraging) expect(data.stationById[f.id] ?? data.workstations.find((w) => w.name === f.name)).toBeUndefined();
    for (const f of data.foraging) for (const d of f.drops) expect(Object.keys(d.chance).length).toBeGreaterThan(0);
  });
  it('the moor is open from the start and its deck changes with the season', () => {
    const p = defaultPlayer();                              // Twice-Born: Health and two more Elements, no skills
    const row = (season: string, q = p) => forageRows(data, q, season).find((r) => r.spot.name === 'A Walk on the Moor')!;
    expect(row('Spring').available).toBe(true);
    expect(row('Spring').ready).toBe(false);                // needs a Heart, Scale or Rose skill
    expect(row('Spring').drops.map((d) => d.name)).toContain('Viper Egg');
    expect(row('Numa').drops.map((d) => d.name)).toEqual(expect.arrayContaining(['Stray Dog', 'Skaptodon Fang']));
    expect(row('Numa').drops.map((d) => d.name)).not.toContain('Viper Egg');
    expect(row('').drops).toHaveLength(row('').spot.drops.length);
    const skill = data.skills.find((s) => !s.isLanguage && s.primary === 'rose')!;
    expect(row('Spring', { ...p, skills: { [skill.id]: 1 } }).ready).toBe(true);
  });
  it('lists places I can use first, then reachable ones, then locked ones', () => {
    const p = defaultPlayer();
    p.roomsUnlocked['crowcross-sands'] = true;
    const order = forageRows(data, p, '').map((r) => (r.ready ? 0 : r.available ? 1 : 2));
    expect(order).toEqual([...order].sort());
    expect(new Set(order).size).toBe(3);
  });
  it('a garden takes a Heart Element and a Nectar skill, and follows its room', () => {
    const p = defaultPlayer();
    const garden = () => forageRows(data, p, 'Winter').find((r) => r.spot.place === "St Brandan's Cloister")!;
    expect(garden().available).toBe(false);
    expect(garden().elements.map((e) => e.id)).toEqual(['chor', 'health']);
    expect(garden().skills.every((s) => s.skill.primary === 'nectar' || s.skill.secondary === 'nectar')).toBe(true);
    expect(garden().drops.map((d) => d.name)).toEqual(['Blue Crown']);
    p.roomsUnlocked['st-brandans-cloister'] = true;
    expect(garden().available).toBe(true);
    const well = forageRows(data, p, 'Numa').find((r) => r.spot.name === 'Hush House Well')!;
    expect(well.needsSkill).toBe(false);
    expect(well.drops.map((d) => d.name)).toEqual(['Mist-Kissed Water']);
  });
});

describe('caches', () => {
  it('every cache opens into something, with chances that add up', () => {
    expect(data.caches).toHaveLength(25);
    for (const c of data.caches) {
      expect(c.drops.length).toBeGreaterThan(0);
      expect(Math.abs(c.drops.reduce((n, d) => n + (d.chance ?? 0), 0) - 100)).toBeLessThan(1.5);
      expect(data.itemById[c.id]).toBeUndefined();          // caches stay out of the item table and the rules
    }
    const flotsam = data.caches.find((c) => c.id === 'contraband-flotsam')!;
    expect(flotsam.drops.map((d) => d.cache)).toEqual(['forsaken-packages', 'lost-packages', 'slim-parcel', 'tall-parcel']);
    expect(flotsam.sources.find((s) => s.name === 'Beachcombing')?.repeatable).toBe(true);
    expect(data.caches.find((c) => c.id === 'abandoned-luggage')!.sources.length).toBeGreaterThan(0);
    expect(data.caches.find((c) => c.id === 'bag-of-tricks')!.drops[0].chance).toBeCloseTo(15.4);
    const beach = data.foraging.find((f) => f.name === 'Beachcombing')!;
    expect(beach.drops.find((d) => d.name === 'Contraband Flotsam')!.cache).toBe('contraband-flotsam');
  });
});

describe('the sea and Numa', () => {
  it("swimming gives Memory: Salt, a penny gives Memory: Impulse, and Numa changes both", () => {
    const p = defaultPlayer();
    p.roomsUnlocked['crowcross-sands'] = true;
    const names = (spot: string, season: string) => forageRows(data, p, season).find((r) => r.spot.name === spot)!.drops.map((d) => d.name + (d.with ? ` with ${d.with}` : ''));
    expect(names("Sea's Edge: swim", 'Summer')).toEqual(['Memory: Salt', 'Memory: Solace with Basket of Towels']);
    expect(names("Sea's Edge: swim", 'Numa')).toEqual(['Curious Hunch']);        // instead of Memory: Salt (owner's rule)
    p.roomsUnlocked['boathouse'] = true;
    expect(names('Brancrug Boathouse: swim', 'Numa')).toEqual(['Curious Hunch']);
    expect(names("Sea's Edge: renounce a penny", 'Winter')).toEqual(['Memory: Impulse']);
    expect(names("Sea's Edge: renounce a penny", 'Numa')).toEqual(['Horizon-Sight']);
    const swim = forageRows(data, p, 'Summer').find((r) => r.spot.name === "Sea's Edge: swim")!;
    expect(swim.elements).toEqual([{ id: 'health', held: true }]);
    expect(swim.ready).toBe(true);
    // the Boathouse allows swimming but no penny; the Loading Dock Crane neither
    expect(data.foraging.filter((f) => f.place === 'Boathouse').map((f) => f.name)).toEqual(['Brancrug Boathouse: swim']);
    expect(data.foraging.some((f) => f.name.includes('Crane'))).toBe(false);
  });
  it('no helper can be hired during Numa, so no room is openable by Assistance', () => {
    expect(helpersIn(data, 'Numa')).toEqual([]);
    expect(helpersIn(data, 'Spring').filter((a) => a.season).map((a) => a.id)).toEqual(['the-miner']);
    expect(helpersIn(data, '')).toHaveLength(14);
    const p = defaultPlayer();
    p.roomsUnlocked['cucurbit-bridge'] = true;
    const lodge = (season: string) => roomStatuses(makeCtx(data, p), helpersIn(data, season)).find((s) => s.room.id === 'keepers-lodge')!;
    expect(lodge('').state).toBe('openable');
    expect(lodge('Numa').state).toBe('short');
  });
});

describe('default preferences', () => {
  it('count room contents, but a workstation is unlocked only through its room', () => {
    const p = defaultPlayer();
    expect(p.settings).toMatchObject({ countRoomContents: true, assumeAllStationsUnlocked: false, hideUnfound: false });
    p.skills['sharps'] = 4;
    expect(makeCtx(data, p).crafted.size).toBe(0);            // nothing can be crafted before a room is open
  });
});

describe('librarians', () => {
  it('every origin starts with two elements and a journal', () => {
    expect(LIBRARIANS).toHaveLength(9);
    for (const l of LIBRARIANS) {
      const p = defaultPlayer(); p.settings.librarian = l.id; p.settings.librarianVariant = null;
      expect(startElements(p)).toHaveLength(2);
    }
  });
  it('the journal adds its element to the tree statistics', () => {
    const none = treeStats(data, emptyTree(), ['shapt', 'phost'], false);
    const with_ = treeStats(data, emptyTree(), ['shapt', 'phost'], false, 'phost');
    expect(with_.elements.find((e) => e.element === 'phost')!.base).toBe(none.elements.find((e) => e.element === 'phost')!.base + 1);
  });
  it('a schema 1 save migrates its starting elements to a Librarian', () => {
    const m = migrate({ schemaVersion: 1, skills: { sharps: 2 }, settings: { startElements: ['fet', 'wist'], planMode: true } });
    expect(m.settings.librarian).toBe('magnate');
    expect(m.settings.planMode).toBe(true);
    expect(m.skills.sharps).toBe(2);
    expect(m.pinnedRecipes).toEqual({});
  });
  it('a schema 2 save gains an empty list of saved plans, and saved plans survive a round trip', () => {
    expect(migrate({ schemaVersion: 2, skills: { sharps: 2 } }).savedPlans).toEqual([]);
    const tree = PRESETS[0].tree;
    const m = migrate({ schemaVersion: 3, savedPlans: [{ name: 'Mine', tree, journal: true }, { name: 'Mine', tree: emptyTree(), journal: false },
      { name: ' ', tree }, { name: 'Short', tree: { hushery: ['sharps'] } }] });
    expect(m.schemaVersion).toBe(3);
    expect(m.savedPlans.map((x) => x.name)).toEqual(['Mine', 'Short']);       // one per name, nameless dropped
    expect(m.savedPlans[0]).toEqual({ name: 'Mine', tree, journal: true });
    expect(m.savedPlans[1].tree.hushery).toEqual(['sharps', null, null, null, null, null, null, null, null]);
    expect(m.savedPlans[1].tree.birdsong).toHaveLength(9);
  });
  it('saving, loading and deleting a plan in the store', () => {
    const st = usePlayer.getState;
    st().reset(); st().setTree(PRESETS[0].tree); st().setJournal(true); st().savePlan('A');
    st().setTree(emptyTree()); st().setJournal(false); st().savePlan('B'); st().savePlan('A');   // A replaced, now the empty tree
    expect(st().savedPlans.map((x) => x.name)).toEqual(['A', 'B']);
    st().setTree(PRESETS[0].tree); st().savePlan('C'); st().setTree(emptyTree());
    st().loadPlan('C');
    expect(st().tree).toEqual(PRESETS[0].tree);
    st().tree.hushery[0] = null;                                   // editing the live tree leaves the saved copy alone
    expect(st().savedPlans.find((x) => x.name === 'C')!.tree).toEqual(PRESETS[0].tree);
    st().deletePlan('C');
    expect(st().savedPlans.map((x) => x.name)).toEqual(['A', 'B']);
    expect(exportState().savedPlans).toHaveLength(2);
    st().reset();
  });
});

describe('helpers and rooms', () => {
  it('has 14 helpers and rooms with requirements', () => {
    expect(data.assistants).toHaveLength(14);
    expect(data.rooms.filter((r) => Object.keys(r.requires).length).length).toBeGreaterThan(90);
  });
  it('a helper takes one boost per kind of card, never the same card twice', () => {
    const p = defaultPlayer();
    p.soul.phost = [2, 0, 0, 0];
    p.settings.weather = 'sunny';                      // Lantern 2, Sky 2 (a Memory)
    p.itemsOwned['mirrorscope'] = true;                // Tool, Lantern 1 -> also yields Memory: Sight (Lantern 1)
    const ctx = makeCtx(data, p);
    const rector = data.assistants.find((a) => a.id === 'the-rector')!;
    const plan = helperBest(ctx, helperPool(ctx), rector, 'lantern');
    // Rector 2 + one Phost 2 + best memory (Sunny 2) + tool (Mirrorscope 1); the second Phost and second memory do not stack
    expect(plan.total).toBe(7);
    const ids = plan.picks.filter((k) => k.card).map((k) => k.card!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('boosts of different kinds all add up', () => {
    const p = defaultPlayer();
    p.soul.phost = [1, 0, 0, 0];                       // Lantern 2
    p.settings.weather = 'sunny';                      // Memory, Lantern 2
    p.itemsOwned['mirrorscope'] = true;                // Tool, Lantern 1
    p.itemsOwned['dawnlion-coffee'] = true;            // Beverage, Lantern 2
    p.itemsOwned['aglaophotis-souffle'] = true;        // Sustenance, Lantern 2
    p.itemsOwned['amber-pumpkin'] = true;              // a second Sustenance (Lantern 1) must not count
    const ctx = makeCtx(data, p);
    const rector = data.assistants.find((a) => a.id === 'the-rector')!;
    const plan = helperBest(ctx, helperPool(ctx), rector, 'lantern');
    expect(plan.picks.filter((k) => k.card).map((k) => k.slot)).toEqual(['Soul', 'Beverage', 'Memory', 'Sustenance', 'Tool']);
    expect(plan.total).toBe(2 + 2 + 2 + 2 + 2 + 1);
  });
  it('the Rowenarium is reached from the Upper Pump Room', () => {
    expect(data.roomById['rowenarium-room'].openedFrom).toEqual(['upper-pump-room']);
    expect(data.rooms.filter((r) => !r.openedFrom.length).map((r) => r.id).sort()).toEqual(['crowcross-sands', 'cucurbit-bridge']);
  });
  it('every room can be reached from the Cucurbit Bridge by following exposures', () => {
    const seen = new Set(['cucurbit-bridge']);
    const queue = [...seen];
    while (queue.length) for (const id of data.roomById[queue.pop()!].exposes) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    expect(data.rooms.filter((r) => !seen.has(r.id)).map((r) => r.id)).toEqual(['crowcross-sands']);
    expect(data.roomById['entrance-hall'].openedFrom).toContain('st-brandans-cloister');
  });
  it('rooms opened with a card or a Circumstance are not offered to helpers', () => {
    expect(data.rooms.filter((r) => !r.needsAssistance).map((r) => `${r.id}:${r.opener}`).sort()).toEqual([
      'lower-pump-room:Circumstance', 'our-lady-beneath:Liquid', 'sea-caves:Circumstance', 'stair-tenebrous:Memory',
      'vestibulum-transitus:Ink', 'watchmans-tower-gatehouse:Item']);
    const p = defaultPlayer();
    for (const r of data.rooms) if (r.id !== 'stair-tenebrous') p.roomsUnlocked[r.id] = true;
    p.roomsUnlocked = { ...p.roomsUnlocked };
    delete p.roomsUnlocked['lower-pump-room'];
    p.settings.countRoomContents = false;
    p.settings.weather = 'sunny';                      // Sky 2, but a Weather memory is forbidden on the Stair Tenebrous
    const st = (q: typeof p) => roomStatuses(makeCtx(data, q), data.assistants);
    const stair = st(p).find((s) => s.room.id === 'stair-tenebrous')!;
    expect(stair.plan).toBeNull();
    expect(stair.card?.card?.aspects ?? []).not.toContain('Weather');
    expect(stair.state).toBe('short');
    expect(st(p).find((s) => s.room.id === 'lower-pump-room')!.state).toBe('special');
    // owner's rule: the memory needs Edge 3 and 3 of one of the other Principles
    expect(data.roomById['stair-tenebrous'].requiresAlso).toEqual({ edge: 3 });
    expect(data.roomById['stair-tenebrous'].requires.edge).toBeUndefined();
    const plain = (i: (typeof data.items)[number]) => i.aspects.includes('Memory') && !i.aspects.includes('Weather');
    const noEdge = data.items.find((i) => plain(i) && (i.principles.edge ?? 0) < 3 && Object.entries(data.roomById['stair-tenebrous'].requires).some(([k, n]) => (i.principles[k as 'sky'] ?? 0) >= n))!;
    p.itemsOwned[noEdge.id] = true;
    expect(st(p).find((s) => s.room.id === 'stair-tenebrous')!.state).toBe('short');
    const memory = data.items.find((i) => plain(i) && (i.principles.edge ?? 0) >= 3 && Object.entries(data.roomById['stair-tenebrous'].requires).some(([k, n]) => (i.principles[k as 'sky'] ?? 0) >= n))!;
    p.itemsOwned = { ...p.itemsOwned, [memory.id]: true };
    const open = st(p).find((s) => s.room.id === 'stair-tenebrous')!;
    expect(open.state).toBe('openable');
    expect(open.card!.card!.id).toBe(memory.id);
  });
  it('the Keeper\'s Lodge can be opened on the first day by a villager', () => {
    const p = defaultPlayer();
    p.roomsUnlocked['cucurbit-bridge'] = true;
    const st = roomStatuses(makeCtx(data, p), data.assistants).find((s) => s.room.id === 'keepers-lodge')!;
    expect(st.state).toBe('openable');
  });
});

describe('memories for upgrading a skill', () => {
  const skill = data.skills.find((s) => !s.isLanguage && s.primary !== 'knock' && s.secondary !== 'knock' && (s.primary === 'winter' || s.secondary === 'winter'))!;
  it('asks for one memory per level and lists only memories sharing a Principle', () => {
    const p = defaultPlayer();
    p.skills[skill.id] = 3;
    const plan = upgradePlan(makeCtx(data, p), skill.id, '')!;
    expect(plan.need).toBe(3);
    expect(plan.rows.length).toBeGreaterThan(5);
    for (const r of plan.rows) {
      expect(r.item.aspects).toContain('Memory');
      expect(plan.principles.some((x) => (r.item.principles[x] ?? 0) > 0), r.item.name).toBe(true);
    }
    // the owner's list: a special Lesson and two things of another kind are not memories
    const all = data.skills.flatMap((s) => upgradePlan(makeCtx(data, p), s.id, '')!.rows.map((r) => r.item.id));
    for (const id of ['a-lesson-of-many-facets', 'avenue-of-enquiry', 'an-offering-to-st-tentreto']) {
      expect(isMemory(data.itemById[id])).toBe(false);
      expect(all).not.toContain(id);
    }
    expect(data.items.filter(isMemory)).toHaveLength(71);
    // ordered: to hand today, then within reach, then out of reach
    const rank = { ready: 0, reachable: 1, locked: 2 };
    for (let i = 1; i < plan.rows.length; i++) expect(rank[plan.rows[i].state]).toBeGreaterThanOrEqual(rank[plan.rows[i - 1].state]);
    p.skills[skill.id] = 9;
    expect(upgradePlan(makeCtx(data, p), skill.id, '')!.need).toBe(0);
  });
  it('counts the sea, mastered books and things in hand, by season', () => {
    const p = defaultPlayer();
    p.skills[skill.id] = 2;
    p.roomsUnlocked['crowcross-sands'] = true;
    const salt = data.itemById['memory-salt'];           // Knock, Moon, Winter: from swimming, except in Numa
    const swim = (season: string) => memorySources(makeCtx(data, p), salt, season).filter((s) => s.kind === 'forage');
    expect(swim('Summer').some((s) => s.state === 'ready' && s.count === 1)).toBe(true);
    expect(swim('Numa').every((s) => s.state === 'locked' && s.count === 0)).toBe(true);
    expect(swim('').every((s) => s.count === 0)).toBe(true);    // no season chosen: nothing is promised
    const before = upgradePlan(makeCtx(data, p), skill.id, 'Summer')!;
    const book = data.books.find((b) => b.memory === 'Memory: Salt')!;
    p.booksMastered[book.id] = true;
    const after = upgradePlan(makeCtx(data, p), skill.id, 'Summer')!;
    expect(after.ready).toBe(before.ready + 1);
    const row = after.rows.find((r) => r.item.id === 'memory-salt')!;
    expect(row.state).toBe('ready');
    expect(row.sources.find((s) => s.kind === 'reread' && s.state === 'ready')!.things!.map((t) => t.name)).toContain(book.name);
  });
  it('knows a memory under both of the wiki\'s names', () => {
    expect(data.itemIdByName['Memory: Intuition']).toBe('intuition');
    expect(data.itemIdByName['Memory: Storm']).toBe('memory-storm');     // a card of its own, not the weather
    expect(data.itemIdByName['Storm']).toBe('storm');
    const p = defaultPlayer();
    const book = data.books.find((b) => b.memory === 'Memory: Intuition')!;
    p.booksMastered[book.id] = true;
    expect(makeCtx(data, p).have.get('intuition')).toContain('re-read');
  });
  it('names weather, crafting and caches as sources', () => {
    const p = defaultPlayer();
    p.settings.weather = 'snow';
    const ctx = makeCtx(data, p);
    expect(memorySources(ctx, data.itemById['snow'], '')[0]).toMatchObject({ kind: 'weather', state: 'ready', count: 1 });
    expect(memorySources(ctx, data.itemById['hail'], '')[0]).toMatchObject({ kind: 'weather', count: 0 });
    expect(memorySources(ctx, data.itemById['torgues-cleansing'], '').some((s) => s.kind === 'craft')).toBe(true);
    expect(memorySources(ctx, data.itemById['didumos'], '').filter((s) => s.kind === 'cache').map((s) => s.label)).toContain('Open Imperial Casket');
    expect(memorySources(ctx, data.itemById['memory-sight'], '').some((s) => s.kind === 'cache' && /every time/.test(s.note!))).toBe(true);
  });
});

describe('sources that use nothing up come first', () => {
  const sight = data.itemById['memory-sight'];
  const keeps = data.items.find((i) => i.yieldsMemory === 'Memory: Sight' && !i.considerDestroys)!;
  const spent = data.items.find((i) => i.yieldsMemory === 'Memory: Sight' && i.considerDestroys)!;
  it('a memory is credited to a thing that survives, then a book, then a thing that is used up', () => {
    expect(keeps && spent).toBeTruthy();
    const p = defaultPlayer();
    p.settings.countRoomContents = false;
    p.itemsOwned[spent.id] = true;
    expect(makeCtx(data, p).have.get(sight.id)).toBe(`consider ${spent.name}, which uses it up`);
    p.itemsOwned[keeps.id] = true;                       // ticked later, preferred all the same
    expect(makeCtx(data, p).have.get(sight.id)).toBe(`consider ${keeps.name}`);
    const salt = data.books.filter((b) => b.memory === 'Memory: Salt');
    const sand = data.itemById['sand'];                  // considering Sand gives Memory: Salt and uses the Sand up
    expect(sand.yieldsMemory).toBe('Memory: Salt'); expect(sand.considerDestroys).toBe(true);
    p.itemsOwned['sand'] = true;
    p.booksMastered = { [salt[2].id]: true, [salt[0].id]: true };          // salt[2] was mastered first
    const ctx = makeCtx(data, p);
    expect(ctx.have.get('memory-salt')).toBe(`re-read ${salt[2].name}`);
    const sources = memorySources(ctx, data.itemById['memory-salt'], '');
    const ready = sources.filter((s) => s.state === 'ready');
    expect(ready.map((s) => [s.kind, s.consumes])).toEqual([['reread', false], ['consider', true]]);
    expect(ready[0].things!.map((t) => t.name)).toEqual([salt[2].name, salt[0].name]);
    expect(ready[1].note).toBe('uses the thing up');
    for (let i = 1; i < sources.length; i++) if (sources[i].state === sources[i - 1].state) expect(Number(sources[i].consumes)).toBeGreaterThanOrEqual(Number(sources[i - 1].consumes));
  });
});
