import type { Assistant, Book, Cache, Forage, GameData, Item, Recipe, Room, Skill, Workstation } from './types';

type Raw = Pick<GameData, 'skills' | 'books' | 'items' | 'workstations' | 'recipes' | 'manifest' | 'rooms' | 'assistants' | 'foraging' | 'caches'>;
const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;

export function indexData(raw: Raw): GameData {
  const roomIdByStation: Record<string, string> = {};
  for (const r of raw.rooms) for (const w of r.workstations) roomIdByStation[w] = r.id;
  // some workstation pages name their room although the room page does not list them
  const roomByName = Object.fromEntries(raw.rooms.map((r) => [r.name, r.id]));
  for (const w of raw.workstations) if (!roomIdByStation[w.id] && w.room && roomByName[w.room]) roomIdByStation[w.id] = roomByName[w.room];
  return { ...raw, skillById: byId<Skill>(raw.skills), itemById: byId<Item>(raw.items),
    bookById: byId<Book>(raw.books), stationById: byId<Workstation>(raw.workstations), roomById: byId<Room>(raw.rooms),
    itemIdByName: Object.fromEntries(raw.items.map((i) => [i.name, i.id])), roomIdByStation };
}

export async function loadData(): Promise<GameData> {
  const base = import.meta.env.BASE_URL;
  const get = async (name: string) => {
    const r = await fetch(`${base}data/${name}.json`);
    if (!r.ok) throw new Error(`Could not load ${name}.json (${r.status})`);
    return r.json();
  };
  const [skills, books, items, workstations, recipes, manifest, rooms, assistants, foraging, caches] = await Promise.all(
    ['skills', 'books', 'items', 'workstations', 'recipes', 'manifest', 'rooms', 'assistants', 'foraging', 'caches'].map(get));
  return indexData({ skills, books, items, workstations, recipes: recipes as Recipe[], manifest,
    rooms: rooms as Room[], assistants: assistants as Assistant[], foraging: foraging as Forage[], caches: caches as Cache[] });
}
