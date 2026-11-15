export type PrincipleId =
  | 'edge' | 'forge' | 'grail' | 'heart' | 'knock' | 'lantern' | 'moon' | 'moth' | 'nectar'
  | 'rose' | 'scale' | 'sky' | 'winter';
export type ElementId = 'chor' | 'ereb' | 'fet' | 'health' | 'mettle' | 'phost' | 'shapt' | 'trist' | 'wist';
export type WisdomId =
  | 'illumination' | 'hushery' | 'nyctodromy' | 'skolekosophy' | 'the-bosk' | 'preservation'
  | 'birdsong' | 'horomachistry' | 'ithastry';
export type PMap = Partial<Record<PrincipleId, number>>;

export interface Skill {
  id: string; name: string; icon?: boolean; primary: PrincipleId; secondary: PrincipleId; isLanguage: boolean;
  /** The two Wisdoms it can be committed to: the Element granted, and the text the game shows on committing
   *  (with its title). */
  commit: { wisdom: WisdomId; element: ElementId; text?: string | null; title?: string | null }[];
  specialties: string[];
  description?: string | null;   // the in-game text, as quoted on the wiki (also on books, items, stations, rooms, caches)
}
export interface Book {
  id: string; name: string; principle: PrincipleId; mystery: number; language: string | null;
  languageName: string | null; type: string; period: string | null;
  lesson: { skill: string; count: number } | null; memory: string | null; tally: number | null;
  multitudinous: boolean; description?: string | null;
  reading?: string | null;   // what the Librarian learns on starting it (the game's "I'm Reading..." text)
  read?: string | null;      // and on mastering it ("I've Read...")
}
export interface Item {
  id: string; name: string; icon?: boolean; principles: PMap; aspects: string[]; yieldsMemory: string | null; considerDestroys?: boolean;
  sources: string[]; craftable: boolean; description?: string | null;
}
export interface Workstation {
  id: string; name: string; kind: string; room: string | null; principles: PrincipleId[];
  slots: string[][]; evolveVia: WisdomId[]; canCraft: boolean; description?: string | null;
}
export type Tier = 'prentice' | 'scholar' | 'keeper';
export interface Recipe {
  id: string; result: string; resultName: string; principle: PrincipleId; tier: Tier; skills: string[];
  resultPrinciples: PMap; resultAspects: string[];
  ingredient: { aspect?: string; item?: string; label: string; note?: string } | null;
}
export interface Room {
  id: string; name: string; lockedName: string | null; era: string | null;
  requires: PMap;        // any one of these Principles at the given amount
  requiresAlso: PMap;    // and every one of these as well (a card-opened room only)
  requiresItems: string[];
  needsAssistance: boolean;
  /** What opens it: 'Assistance' (a helper), 'Item' or 'Circumstance' (named in openerName), or the aspect of a card. */
  opener: string; openerName: string | null; openerForbids: string | null;
  description?: string | null;         // the text of the room once unlocked
  lockedDescription?: string | null;   // the text shown before it is unlocked, under its locked name
  exposes: string[]; contents: string[]; workstations: string[]; openedFrom: string[];
}
export interface Assistant {
  id: string; name: string; icon?: boolean; kind: string; season: string | null; principles: PMap; unique: string | null;
  hire: string | null; fee: number;
}
export interface ForageDrop { item: string | null; name: string; chance: Record<string, number>; with?: string; cache?: string }   // season -> percent of a full deck; `with` = only when this thing is added
/** A gathering station: an Element of the Soul, usually with a Skill, brings back something from a seasonal deck. */
export interface Forage {
  id: string; name: string; place: string; room: string | null;   // room null = outside the house, open from the start
  count: number; principles: PrincipleId[]; soulPrinciples: PrincipleId[]; skillPrinciples: PrincipleId[];   // no skill Principles = no Skill slot
  soulElements: ElementId[] | null;   // the exact Elements accepted, where the wiki names them (empty = none needed)
  needs: string | null;               // a thing that must be given, such as a Penny
  drops: ForageDrop[]; note: string | null;
}
/** A thing that is opened (Considered) and turns into one of several things. */
export interface Cache {
  id: string; name: string; icon?: boolean; principles: PMap; description?: string | null;
  sources: { name: string; repeatable: boolean }[];
  alsoGives: string | null;        // a memory given every time, on top of the draw
  sharedWith: string[];            // caches drawing from the same deck, so nothing comes twice
  drops: { item: string | null; cache: string | null; name: string; chance: number | null }[];   // chance in percent
}
export type LibrarianId = 'archaeologist' | 'artist' | 'cartographer' | 'executioner' | 'magnate' | 'prodigal'
  | 'revolutionary' | 'symurgist' | 'twice-born';
export interface GameData {
  skills: Skill[]; books: Book[]; items: Item[]; workstations: Workstation[]; recipes: Recipe[];
  rooms: Room[]; assistants: Assistant[]; foraging: Forage[]; caches: Cache[];
  itemIdByName: Record<string, string>; roomIdByStation: Record<string, string>; roomById: Record<string, Room>;
  manifest: { dataVersion: string; source: string; license: string; counts: Record<string, number> };
  skillById: Record<string, Skill>; itemById: Record<string, Item>; bookById: Record<string, Book>;
  stationById: Record<string, Workstation>;
}

export type TreeState = Record<WisdomId, (string | null)[]>;
/** A Tree of Wisdoms kept under a name, with whether the journal sat at its root. */
export interface SavedPlan { name: string; tree: TreeState; journal: boolean }
export interface PlayerState {
  schemaVersion: 3;
  skills: Record<string, number>;          // skill id -> level 1..9 (absent = not owned)
  tree: TreeState;                          // wisdom -> 9 nodes, index 0 = level 1
  soul: Record<ElementId, number[]>;        // element -> card counts at base, +, ++, +++
  booksMastered: Record<string, true>;
  itemsOwned: Record<string, true>;
  stationsUnlocked: Record<string, true>;
  roomsUnlocked: Record<string, true>;
  pinnedRecipes: Record<string, true>;
  journalCommitted: boolean;                // the journal placed at the root of the Tree
  savedPlans: SavedPlan[];                  // Tree plans kept under a name, newest first
  settings: {
    assumeAllStationsUnlocked: boolean;
    planMode: boolean;                      // tree: ignore owned skills and their levels
    librarian: LibrarianId;
    librarianVariant: ElementId | null;     // the one free choice the Archaeologist and Artist have
    weather: string;                        // item id of today's weather memory, or ''
    season: string;                         // '' = any season, for seasonal helpers
    countRoomContents: boolean;             // count things lying in unlocked rooms as things I have
    hideUnfound: boolean;
  };
}
