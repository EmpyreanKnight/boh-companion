import { ELEMENT_IDS, LIBRARIANS } from './constants';
import { emptyTree } from './engine';
import type { ElementId, LibrarianId, PlayerState } from './types';

/** The soul cards a Librarian holds on the first day: Health plus the two chosen Elements. */
export function startingSoul(librarian: LibrarianId, variant: ElementId | null): Record<ElementId, number[]> {
  const soul = Object.fromEntries(ELEMENT_IDS.map((e) => [e, [0, 0, 0, 0]])) as Record<ElementId, number[]>;
  const l = LIBRARIANS.find((x) => x.id === librarian) ?? LIBRARIANS[0];
  soul.health[0] += 1;
  for (const e of l.fixed) soul[e][0] += 1;
  if (l.choice) soul[variant && l.choice.includes(variant) ? variant : l.choice[0]][0] += 1;
  return soul;
}

export function defaultPlayer(): PlayerState {
  return { schemaVersion: 2, skills: {}, tree: emptyTree(), soul: startingSoul('twice-born', null), booksMastered: {},
    itemsOwned: {}, stationsUnlocked: {}, roomsUnlocked: {}, pinnedRecipes: {}, journalCommitted: false,
    settings: { assumeAllStationsUnlocked: true, planMode: false, librarian: 'twice-born', librarianVariant: null,
      weather: '', season: '', countRoomContents: true, hideUnfound: false } };
}
