import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ELEMENT_IDS, LIBRARIANS, WISDOM_IDS } from './engine/constants';
import { defaultPlayer } from './engine/defaults';
import { emptyTree, librarianOf, makeCtx, startElements, treeStats, type Ctx } from './engine/engine';
import type { ElementId, GameData, PlayerState, SavedPlan, TreeState, WisdomId } from './engine/types';

// Every page under <user>.github.io shares one storage area, so the key carries the app name.
export const STORAGE_KEY = 'boh-companion:player:v1';   // the key stays; the stored version number migrates

interface Actions {
  setSkill: (id: string, level: number) => void;
  setSoul: (e: ElementId, level: number, n: number) => void;
  toggle: (field: 'booksMastered' | 'itemsOwned' | 'stationsUnlocked' | 'roomsUnlocked' | 'pinnedRecipes', id: string) => void;
  setJournal: (on: boolean) => void;
  setSetting: <K extends keyof PlayerState['settings']>(k: K, v: PlayerState['settings'][K]) => void;
  place: (w: WisdomId, level: number, skill: string | null) => void;
  clearNodes: (nodes: { wisdom: WisdomId; level: number }[]) => void;
  setTree: (t: TreeState) => void;
  savePlan: (name: string) => void;        // keep the current tree under a name, replacing a plan of that name
  loadPlan: (name: string) => void;
  deletePlan: (name: string) => void;
  soulFromTree: (data: GameData, evolveAll: boolean) => void;
  replaceAll: (p: PlayerState) => void;
  reset: () => void;
}

const cloneTree = (t: TreeState) => Object.fromEntries(WISDOM_IDS.map((w) => [w, [...t[w]]])) as TreeState;

export const usePlayer = create<PlayerState & Actions>()(
  persist(
    (set) => ({
      ...defaultPlayer(),
      setSkill: (id, level) => set((s) => {
        const skills = { ...s.skills };
        if (level <= 0) delete skills[id]; else skills[id] = Math.min(9, level);
        return { skills };
      }),
      setSoul: (e, level, n) => set((s) => {
        const row = [...(s.soul[e] ?? [0, 0, 0, 0])];
        row[level] = Math.max(0, Math.min(16, n));
        return { soul: { ...s.soul, [e]: row } };
      }),
      toggle: (field, id) => set((s) => {
        const m = { ...s[field] };
        if (m[id]) delete m[id]; else m[id] = true;
        return { [field]: m } as Partial<PlayerState>;
      }),
      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
      setJournal: (on) => set({ journalCommitted: on }),
      place: (w, level, skill) => set((s) => {
        const tree = cloneTree(s.tree);
        if (skill) for (const x of WISDOM_IDS) tree[x] = tree[x].map((id) => (id === skill ? null : id));
        tree[w][level - 1] = skill;
        return { tree };
      }),
      clearNodes: (nodes) => set((s) => {
        const tree = cloneTree(s.tree);
        for (const n of nodes) tree[n.wisdom][n.level - 1] = null;
        return { tree };
      }),
      setTree: (t) => set({ tree: cloneTree(t) }),
      savePlan: (name) => set((s) => ({ savedPlans: [{ name, tree: cloneTree(s.tree), journal: s.journalCommitted },
        ...s.savedPlans.filter((x) => x.name !== name)] })),
      loadPlan: (name) => set((s) => {
        const plan = s.savedPlans.find((x) => x.name === name);
        return plan ? { tree: cloneTree(plan.tree), journalCommitted: plan.journal } : {};
      }),
      deletePlan: (name) => set((s) => ({ savedPlans: s.savedPlans.filter((x) => x.name !== name) })),
      soulFromTree: (data, evolveAll) => set((s) => {
        const stats = treeStats(data, s.tree, startElements(s), evolveAll, s.journalCommitted ? librarianOf(s).journal.element : null);
        const soul = Object.fromEntries(stats.elements.map((e) => [e.element, e.hand])) as Record<ElementId, number[]>;
        return { soul };
      }),
      replaceAll: (p) => set({ ...defaultPlayer(), ...p, settings: { ...defaultPlayer().settings, ...p.settings } }),
      reset: () => set(defaultPlayer()),
    }),
    { name: STORAGE_KEY, version: 4, migrate: (old) => migrate(old) as PlayerState & Actions },
  ),
);

/**
 * The engine context for the current progress, shared by every page. It is rebuilt only when something the
 * rules read has changed, so switching pages, pinning a recipe or moving a skill on the Tree reuses it.
 */
let shared: { data: GameData; deps: unknown[]; ctx: Ctx } | null = null;
export function useCtx(data: GameData): Ctx {
  const s = usePlayer();
  const deps = [s.skills, s.soul, s.itemsOwned, s.roomsUnlocked, s.stationsUnlocked, s.booksMastered,
    s.settings.weather, s.settings.countRoomContents, s.settings.assumeAllStationsUnlocked];
  if (!shared || shared.data !== data || deps.some((d, i) => d !== shared!.deps[i])) shared = { data, deps, ctx: makeCtx(data, s) };
  return shared.ctx;
}

/** Bring a save from any earlier schema up to the current one; unknown fields fall back to defaults. */
export function migrate(raw: unknown): PlayerState {
  const d = defaultPlayer();
  const p = (raw ?? {}) as Partial<PlayerState>;
  const readTree = (t: Partial<TreeState> | undefined) => {
    const out = emptyTree();
    for (const w of WISDOM_IDS) if (Array.isArray(t?.[w])) out[w] = Array.from({ length: 9 }, (_, i) => t![w]![i] ?? null);
    return out;
  };
  const tree = readTree(p.tree);
  // settings added later (schema 4: evolveAll) take their default above
  // saved Tree plans arrived with schema 3; drop anything without a name, keep one plan per name
  const savedPlans: SavedPlan[] = [];
  for (const x of Array.isArray(p.savedPlans) ? p.savedPlans : []) {
    if (x && typeof x.name === 'string' && x.name.trim() && !savedPlans.some((y) => y.name === x.name)) {
      savedPlans.push({ name: x.name, tree: readTree(x.tree), journal: !!x.journal });
    }
  }
  const soul = { ...d.soul };
  for (const e of ELEMENT_IDS) if (Array.isArray(p.soul?.[e])) soul[e] = [0, 1, 2, 3].map((i) => Number(p.soul![e][i]) || 0);
  const old = (p.settings ?? {}) as Record<string, unknown>;
  const settings = { ...d.settings };
  for (const k of Object.keys(settings) as (keyof typeof settings)[]) if (k in old) (settings as Record<string, unknown>)[k] = old[k];
  // schema 1 stored the two starting Elements; map them to the Librarian they make
  const pair = old.startElements as ElementId[] | undefined;
  if (!('librarian' in old) && Array.isArray(pair)) {
    const l = LIBRARIANS.find((x) => x.fixed.every((e) => pair.includes(e)) && (!x.choice || x.choice.some((e) => pair.includes(e))));
    if (l) { settings.librarian = l.id; settings.librarianVariant = l.choice?.find((e) => pair.includes(e)) ?? null; }
  }
  return { schemaVersion: 4, skills: p.skills ?? {}, tree, soul, booksMastered: p.booksMastered ?? {},
    itemsOwned: p.itemsOwned ?? {}, stationsUnlocked: p.stationsUnlocked ?? {}, roomsUnlocked: p.roomsUnlocked ?? {},
    pinnedRecipes: p.pinnedRecipes ?? {}, journalCommitted: !!p.journalCommitted, savedPlans, settings };
}

/** Only the serialisable player state, for export. */
export function exportState(): PlayerState {
  const s = usePlayer.getState();
  return { schemaVersion: 4, skills: s.skills, tree: s.tree, soul: s.soul, booksMastered: s.booksMastered,
    itemsOwned: s.itemsOwned, stationsUnlocked: s.stationsUnlocked, roomsUnlocked: s.roomsUnlocked,
    pinnedRecipes: s.pinnedRecipes, journalCommitted: s.journalCommitted, savedPlans: s.savedPlans, settings: s.settings };
}

export function validateImport(raw: unknown): PlayerState {
  const v = (raw as { schemaVersion?: number } | null)?.schemaVersion;
  if (!raw || typeof raw !== 'object' || (v !== 1 && v !== 2 && v !== 3 && v !== 4)) throw new Error('Not a Book of Hours Companion save.');
  return migrate(raw);
}
