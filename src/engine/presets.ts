import { slug, WISDOM_IDS } from './constants';
import type { TreeState, WisdomId } from './types';

/**
 * Preset trees from the Steam guide "Minmax'd Wisdom Trees et al." by SCPantera
 * (https://steamcommunity.com/sharedfiles/filedetails/?id=3173709809); the "Tree of OCDs"
 * is by wiki user AllNamesTaken1. Each list runs from level 1 to level 9; null = node left empty.
 */
type Raw = Record<WisdomId, (string | null)[]>;

const V3: Raw = {
  illumination: ['Purifications & Exaltations', 'Pyroglyphics', 'Disciplines of the Scar', 'Glaziery & Lightsmithing', 'Meniscate Reflections', null, 'Disciplines of the Hammer', 'Preliminal Meter', 'Auroral Contemplations'],
  hushery: ['Ericapaean', 'Snow Stories', null, 'Maggephene Mysteries', 'Sharps', 'Glassblowing & Vesselcrafting', 'Serpents & Venoms', 'Sights & Sensations', 'Inks of Power'],
  nyctodromy: ['Vak', 'Hyksos', 'Door & Wall', 'Sickle & Eclipse', 'Pearl & Tide', null, "Watchman's Paradoxes", 'Path & Pilgrim', 'Coil & Chasm'],
  skolekosophy: [null, 'Killasimi', 'Rhyme & Remembrance', 'Horns & Ivories', 'Edicts Liminal', 'Putrefactions & Calcinations', 'Lockworks & Clockworks', 'Solutions & Separations', 'Ragged Crossroads'],
  'the-bosk': ['Weaving & Knotworking', 'Furs & Feathers', null, 'Desires & Dissolutions', 'Applebright Euphonies', 'Resurgences & Emergences', 'Orchids & Narcotics', 'Drums & Dances', 'Insects & Nectars'],
  preservation: ['Cracktrack', 'Hill & Hollow', 'Surgeries & Exsanguinations', 'Quenchings & Quellings', 'Tridesma Hiera', 'Herbs & Infusions', 'Edicts Inviolable', 'Stone Stories', 'Rites of the Roots'],
  birdsong: ['Ramsund', 'Sea Stories', 'Pentiments & Precursors', null, 'Wolf Stories', 'Sand Stories', 'Strings & Songs', 'Sky Stories', 'Leaves & Thorns'],
  horomachistry: [null, 'Sabazine', 'Bells & Brazieries', 'Sacra Limiae', 'The Great Signs and the Great Scars', 'Sacra Solis Invicti', 'Ouranoscopy', 'Inks of Containment', 'Edicts Martial'],
  ithastry: ['Deep Mandaic', 'Fucine', 'Kernewek Henavek', null, 'Spices & Savours', 'Stitching & Binding', 'Inks of Revelation', 'Anbary & Lapidary', 'Transformations & Liberations'],
};

/** The guide gives no node order for this one; skills are placed in the order listed. */
const OCD: Raw = {
  hushery: ['Sights & Sensations', 'Sharps', 'Snow Stories', 'Glassblowing & Vesselcrafting', 'Inks of Power', 'Serpents & Venoms', 'Ericapaean', 'Quenchings & Quellings', null],
  ithastry: ['Stitching & Binding', 'Kernewek Henavek', 'Spices & Savours', 'Fucine', 'Transformations & Liberations', 'Anbary & Lapidary', 'Deep Mandaic', 'Inks of Revelation', null],
  illumination: ['Preliminal Meter', 'Auroral Contemplations', 'Meniscate Reflections', 'Disciplines of the Scar', 'Pyroglyphics', 'Disciplines of the Hammer', 'Glaziery & Lightsmithing', 'Purifications & Exaltations', null],
  horomachistry: ['Inks of Containment', 'Edicts Martial', 'Sacra Limiae', 'Bells & Brazieries', 'Sabazine', 'Sacra Solis Invicti', 'Ouranoscopy', 'The Great Signs and the Great Scars', null],
  nyctodromy: ['Path & Pilgrim', 'Vak', "Watchman's Paradoxes", 'Furs & Feathers', 'Door & Wall', 'Sickle & Eclipse', 'Coil & Chasm', 'Hyksos', null],
  skolekosophy: ['Solutions & Separations', 'Horns & Ivories', 'Ragged Crossroads', 'Lockworks & Clockworks', 'Edicts Liminal', 'Killasimi', 'Putrefactions & Calcinations', 'Wolf Stories', null],
  'the-bosk': ['Applebright Euphonies', 'Desires & Dissolutions', 'Orchids & Narcotics', 'Insects & Nectars', 'Drums & Dances', 'Weaving & Knotworking', 'Resurgences & Emergences', 'Pearl & Tide', null],
  preservation: ['Rites of the Roots', 'Hill & Hollow', 'Herbs & Infusions', 'Tridesma Hiera', 'Maggephene Mysteries', 'Surgeries & Exsanguinations', 'Edicts Inviolable', 'Stone Stories', 'Cracktrack'],
  birdsong: ['Leaves & Thorns', 'Pentiments & Precursors', 'Sea Stories', 'Strings & Songs', 'Sand Stories', 'Ramsund', 'Sky Stories', 'Rhyme & Remembrance', null],
};

function toTree(raw: Raw): TreeState {
  const t = {} as TreeState;
  for (const w of WISDOM_IDS) t[w] = raw[w].map((n) => (n ? slug(n) : null));
  return t;
}

export const PRESETS: { id: string; name: string; note: string; tree: TreeState }[] = [
  { id: 'v3', name: 'Minmax v3 (SCPantera)', note: 'All 73 skills, level 9 on every branch; ordered by crafting usefulness and rarity.', tree: toTree(V3) },
  { id: 'ocd', name: 'Tree of OCDs (AllNamesTaken1)', note: 'Even spread of elements. The source gives no node order, so the order here is arbitrary.', tree: toTree(OCD) },
];
export const PRESET_SOURCE = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3173709809';
