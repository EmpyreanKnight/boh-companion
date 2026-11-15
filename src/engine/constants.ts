import type { ElementId, LibrarianId, PMap, PrincipleId, WisdomId } from './types';

export const PRINCIPLES: { id: PrincipleId; name: string; color: string }[] = [
  { id: 'edge', name: 'Edge', color: '#d7dd49' }, { id: 'forge', name: 'Forge', color: '#ff8e3e' },
  { id: 'grail', name: 'Grail', color: '#fe6150' }, { id: 'heart', name: 'Heart', color: '#fe7e8b' },
  { id: 'knock', name: 'Knock', color: '#b54efc' }, { id: 'lantern', name: 'Lantern', color: '#ffe300' },
  { id: 'moon', name: 'Moon', color: '#cbbcd6' }, { id: 'moth', name: 'Moth', color: '#f2e9c2' },
  { id: 'nectar', name: 'Nectar', color: '#2ed391' }, { id: 'rose', name: 'Rose', color: '#ef63ff' },
  { id: 'scale', name: 'Scale', color: '#cb9f4d' }, { id: 'sky', name: 'Sky', color: '#2c69e1' },
  { id: 'winter', name: 'Winter', color: '#beeeff' },
];
export const PRINCIPLE_IDS = PRINCIPLES.map((p) => p.id);
export const principle = (id: PrincipleId) => PRINCIPLES.find((p) => p.id === id)!;

const two = (a: PrincipleId, b: PrincipleId): PMap[] => [0, 1, 2, 3].map((l) => ({ [a]: 2 + l, [b]: 1 + l }));
export const ELEMENTS: { id: ElementId; name: string; levels: PMap[]; blurb: string }[] = [
  { id: 'chor', name: 'Chor', levels: two('heart', 'grail'), blurb: 'Exuberance, instinct, rhythm.' },
  { id: 'ereb', name: 'Ereb', levels: two('grail', 'edge'), blurb: 'Pride, compassion, hatred and fear.' },
  { id: 'fet', name: 'Fet', levels: two('rose', 'moth'), blurb: 'That part of us which walks in dreams.' },
  { id: 'health', name: 'Health', blurb: 'The dwelling-place of the soul.',
    levels: [{ heart: 1, nectar: 1, scale: 1 }, { heart: 2, nectar: 2, scale: 1 }, { heart: 3, nectar: 3, scale: 2 }, { heart: 4, nectar: 4, scale: 3 }] },
  { id: 'mettle', name: 'Mettle', levels: two('forge', 'edge'), blurb: 'Will; self-discipline.' },
  { id: 'phost', name: 'Phost', levels: two('lantern', 'sky'), blurb: 'Sight, perception, inspiration.' },
  { id: 'shapt', name: 'Shapt', levels: two('knock', 'forge'), blurb: 'Eloquence and understanding.' },
  { id: 'trist', name: 'Trist', levels: two('moth', 'moon'), blurb: 'The change and the longing.' },
  { id: 'wist', name: 'Wist', levels: two('winter', 'lantern'), blurb: 'Name, memory, that part which remains.' },
];
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id);
export const element = (id: ElementId) => ELEMENTS.find((e) => e.id === id)!;
export const LEVEL_SUFFIX = ['', '+', '++', '+++'];

/**
 * The nine Librarians. `fixed` are the Elements that origin always starts with; `choice` is the one
 * element left open (the Archaeologist and the Artist can be reached by more than one pair).
 * `journal.element` is the Element of the Soul the wiki says the journal awards.
 */
export const LIBRARIANS: { id: LibrarianId; name: string; fixed: ElementId[]; choice?: ElementId[];
  journal: { name: string; element: ElementId }; wisdom: WisdomId }[] = [
  { id: 'archaeologist', name: 'The Archaeologist', fixed: ['shapt'], choice: ['wist', 'mettle'], journal: { name: 'Sand-Scarred Journal', element: 'shapt' }, wisdom: 'skolekosophy' },
  { id: 'artist', name: 'The Artist', fixed: ['ereb'], choice: ['chor', 'fet', 'shapt'], journal: { name: 'Bee-Silk Journal', element: 'ereb' }, wisdom: 'the-bosk' },
  { id: 'cartographer', name: 'The Cartographer', fixed: ['fet', 'phost'], journal: { name: 'Serpentskin Journal', element: 'fet' }, wisdom: 'nyctodromy' },
  { id: 'executioner', name: 'The Executioner', fixed: ['chor', 'mettle'], journal: { name: 'Horned Journal', element: 'health' }, wisdom: 'preservation' },
  { id: 'magnate', name: 'The Magnate', fixed: ['fet', 'wist'], journal: { name: 'Silver-Bound Journal', element: 'wist' }, wisdom: 'hushery' },
  { id: 'prodigal', name: 'The Prodigal', fixed: ['chor', 'phost'], journal: { name: 'Hammered Copper Journal', element: 'phost' }, wisdom: 'ithastry' },
  { id: 'revolutionary', name: 'The Revolutionary', fixed: ['fet', 'mettle'], journal: { name: 'Ironclad Journal', element: 'mettle' }, wisdom: 'horomachistry' },
  { id: 'symurgist', name: 'The Symurgist', fixed: ['chor', 'wist'], journal: { name: 'Feather-Decked Journal', element: 'chor' }, wisdom: 'birdsong' },
  { id: 'twice-born', name: 'The Twice-Born', fixed: ['shapt', 'phost'], journal: { name: 'Amber-Flecked Journal', element: 'phost' }, wisdom: 'illumination' },
];
/**
 * When a book is attempted without enough of its Principle, the game may offer an Opportunity: one more card
 * that adds its Principles. The wiki gives these chances for each kind of card to be the one offered.
 */
export const OPPORTUNITIES: { kind: string; chance: number }[] = [
  { kind: 'an Element of the Soul', chance: 38 }, { kind: 'a Memory', chance: 14 },
  { kind: "the day's Weather", chance: 8 }, { kind: 'a piece of Wall Art', chance: 8 },
];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
/** The four regular seasons and Numa, the short season that arrives at random. */
/**
 * Cards the wiki files under Memory that the owner does not count as memories: a special Lesson, and two
 * things of another kind. They are listed with the items and are not offered for upgrading a skill.
 */
const NOT_MEMORIES = new Set(['a-lesson-of-many-facets', 'avenue-of-enquiry', 'an-offering-to-st-tentreto']);
export const isMemory = (item: { id: string; aspects: string[] }) => item.aspects.includes('Memory') && !NOT_MEMORIES.has(item.id);
export const ALL_SEASONS = [...SEASONS, 'Numa'];

export type Art = 'Bright Arts' | 'Night Arts' | 'Arts Unregarded';
/** Ring order, clockwise from the top of the in-game tree. */
export const WISDOMS: { id: WisdomId; name: string; art: Art; elements: [ElementId, ElementId] }[] = [
  { id: 'illumination', name: 'Illumination', art: 'Bright Arts', elements: ['phost', 'mettle'] },
  { id: 'hushery', name: 'Hushery', art: 'Night Arts', elements: ['trist', 'wist'] },
  { id: 'nyctodromy', name: 'Nyctodromy', art: 'Night Arts', elements: ['fet', 'shapt'] },
  { id: 'skolekosophy', name: 'Skolekosophy', art: 'Night Arts', elements: ['shapt', 'ereb'] },
  { id: 'the-bosk', name: 'The Bosk', art: 'Arts Unregarded', elements: ['ereb', 'health'] },
  { id: 'preservation', name: 'Preservation', art: 'Arts Unregarded', elements: ['health', 'chor'] },
  { id: 'birdsong', name: 'Birdsong', art: 'Arts Unregarded', elements: ['chor', 'trist'] },
  { id: 'horomachistry', name: 'Horomachistry', art: 'Bright Arts', elements: ['mettle', 'fet'] },
  { id: 'ithastry', name: 'Ithastry', art: 'Bright Arts', elements: ['wist', 'phost'] },
];
export const WISDOM_IDS = WISDOMS.map((w) => w.id);
export const wisdom = (id: WisdomId) => WISDOMS.find((w) => w.id === id)!;
export const ART_COLOR: Record<Art, string> = {
  'Bright Arts': '#f1c84b', 'Night Arts': '#a99be8', 'Arts Unregarded': '#f08a78',
};

/** The 14 flying lines of the tree: [wisdom, level] pairs, levels counted from the root. */
export const TREE_LINKS: [[WisdomId, number], [WisdomId, number]][] = [
  [['illumination', 2], ['ithastry', 2]], [['illumination', 3], ['hushery', 4]],
  [['illumination', 7], ['hushery', 6]], [['hushery', 2], ['nyctodromy', 1]],
  [['hushery', 5], ['nyctodromy', 4]], [['nyctodromy', 2], ['skolekosophy', 1]],
  [['nyctodromy', 7], ['skolekosophy', 5]], [['skolekosophy', 2], ['the-bosk', 1]],
  [['the-bosk', 2], ['preservation', 1]], [['the-bosk', 2], ['preservation', 3]],
  [['the-bosk', 4], ['preservation', 5]], [['horomachistry', 2], ['birdsong', 3]],
  [['horomachistry', 4], ['birdsong', 5]], [['horomachistry', 5], ['ithastry', 5]],
];

export const TIER_THRESHOLD = { prentice: 5, scholar: 10, keeper: 15 } as const;

export function slug(name: string): string {
  return name.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
