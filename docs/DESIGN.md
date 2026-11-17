# Design

How the app is built, the decisions and game rules it rests on, and its known gaps.

## Architecture

```
wiki (MediaWiki API) --crawl.py--> data-src/raw/pages.json --build_data.py--> public/data/*.json
wiki images ----------fetch_*icons.py---------------------------------------> public/icons/*.webp
                                                                                     |
browser: loadData() -> indexData() -> GameData ---+                                  v
         Zustand store (localStorage) -> PlayerState -+-> makeCtx() -> engine -> pages
```

- The JSON files are the only hand-off between the build and the browser. Nothing is fetched from the
  wiki at run time, and player state never leaves the device.
- The build is a static site. `vite.config.ts` takes the sub-path from `BASE_PATH` (the deploy workflow sets
  `/<repo>/`); `VITE_ICONS=off` builds without the wiki artwork.
- Each build stamps a build id (`__BUILD__` in `vite.config.ts`) onto the data requests
  (`data/<name>.json?v=<id>`), so a new deploy is never served the previous deploy's cached data.
- `src/engine/` is pure TypeScript with no React imports; every page calls it through a context made by
  `makeCtx(data, player)`.
- Pages get that context from `useCtx(data)` in `src/store.ts`. One context is shared by all pages and rebuilt
  only when something the rules read changes (skills, soul, owned items, rooms, stations, mastered books,
  weather and two settings), so switching pages or pinning a recipe costs nothing.
- The context indexes item cards by Principle (strongest first) and by aspect, and remembers the answer of
  every query (`bestReading`, `planRecipe`, `roomStatuses`, ...) in `ctx.memo`. Tables that depend on the game
  data alone (which stations suit which recipe) are built once per data set. Keep new queries on these
  indexes: scanning all items per slot made the Crafting and Hush House pages take over half a second.

## Game data (`public/data/`)

| File | Record | Key fields |
| --- | --- | --- |
| `skills.json` | Skill | `primary`, `secondary`, `isLanguage`, `commit[2]` as `{wisdom, element, text, title}` (the text and title the game shows on committing the skill to that Wisdom), `specialties`, `icon` |
| `books.json` | Book | `principle`, `mystery`, `language` (skill id, or null when known by default), `languageName`, `type`, `period`, `lesson {skill, count}`, `memory`, `tally` (price), `multitudinous`, `reading` and `read` (the game's "I'm Reading..." and "I've Read..." texts, shown in that order in the Database: open for mastered books, behind a toggle otherwise) |
| `items.json` | Item | `principles`, `aspects[]`, `yieldsMemory`, `considerDestroys`, `sources[]`, `craftable`, `icon` |
| `workstations.json` | Workstation | `kind`, `room`, `principles[]`, `slots[][]` (aspects the 4th and 5th slots accept), `evolveVia[]`, `canCraft` |
| `recipes.json` | Recipe | `result`, `resultName`, `resultPrinciples`, `resultAspects`, `principle`, `tier`, `skills[]`, `ingredient {aspect \| item, label, note}`; a second recipe for the same result, Principle and tier gets the id suffix `~2` |
| `rooms.json` | Room | `lockedName`, `era`, `requires` (any one Principle at the given amount), `requiresAlso` (and all of these), `opener` (`Assistance`, `Item`, `Circumstance`, or the aspect of the card that opens it), `openerName`, `openerForbids`, `needsAssistance` (opener is `Assistance`), `requiresItems`, `openedFrom[]`, `exposes[]`, `contents[]`, `workstations[]` |
| `foraging.json` | Forage | `place`, `room` (null = outside the house), `count`, `principles`, `soulPrinciples`, `soulElements` (exact Elements where the wiki names them), `skillPrinciples` (empty = no Skill slot), `needs` (a thing to give, such as a Penny), `note`, `drops[] {item, cache, name, chance {season: percent}, with}` |
| `caches.json` | Cache | `principles`, `sources[] {name, repeatable}`, `alsoGives`, `sharedWith[]`, `drops[] {item, cache, name, chance}`; shown in the Database only |
| `assistants.json` | Assistant | `kind`, `season`, `principles`, `unique` (extra card kind they accept), `hire`, `fee`, `icon` |
| `manifest.json` | | crawl date, counts, licence |

The files are written with two-space indentation so that changes read well in a diff.

How `scripts/build_data.py` derives the less obvious parts:

- **Items in scope:** an item is kept when it gives a memory, is used or made by a recipe, or carries an aspect
  some workstation slot accepts. Books are a separate table. Caches (the wiki's Cache category) are a separate
  table too, so they never enter the rules.
- **Principles:** `lore()` reads a value written inside the template (`{{Lore|Moon|2}}`) or after it
  (`{{Lore|Moon}} 2`); with neither, the value is 1.
- **Names:** `OWNER_ITEM_NAMES` renames a card whose wiki title differs from the game's name (Intuition is
  built as Memory: Intuition), both as an item and where another item names it as the memory it gives.
- **Workstations:** every page in the wiki's Workstation category except gathering stations and the two sea
  stations, which go to `foraging.json`. `canCraft` is false for beds, fireplaces and stations without Principles.
- **Rooms:** prerequisites are the union of the "Opening it exposes" sentence on each room page and the
  "Prerequisite Location" column of the Locations page; a link to a room may name its page with or without
  "(Room)", or use the locked name. `OWNER_PREREQUISITES` and `OWNER_REQUIRES_ALSO` hold the owner's overrides.
- **Recipes:** from the Crafting page. A Scholar-level ingredient that names an aspect is matched by aspect,
  any other by the item itself.
- **Foraging:** the Gathering page lists the stations, the Decks page holds their seasonal decks, the Garden
  page the garden yields; swimming and renouncing a penny are parsed from the Sea's Edge and Brancrug Boathouse
  pages. Chances are percentages of a full deck.
- **Commit texts:** the section of each skill page titled "Wisdom Attunement" (or one of three other headings),
  pairing each quote with the "Committing ... to" paragraph beside it to learn its Wisdom. Only the game's own
  text is kept. Shown in the Database only.
- **Caches:** the list under "Consider" on each cache page, equal shares unless the page gives a weight; where
  each is found comes from the table on the Cache page.

`scripts/crawl.py` reads the wiki categories in `CATEGORIES` and the titles in `PAGES`; `--pages [Category ...]`
fetches only `PAGES` (and the named categories) and merges them into the existing crawl.
`scripts/fetch_card_icons.py` takes each icon from the page's infobox; language pages have no infobox, so their
icon is the image the page opens with. `build_data.py` runs last because it records which icons exist.

Skills, books, items, workstations, rooms and caches also carry `description`: the in-game text, taken from the
first `{{Quote}}` on the wiki page by `quote()` in `build_data.py`. It is display only. For a room that first quote
is the text of the unlocked room; `lockedDescription` is the quote in the page's "(Locked)" section. The Hush
House page shows the one for the room's present state and folds the other away. The game has a third text,
shown while a room is being unlocked; the wiki does not record it, so the app has none.

Static tables live in `src/engine/constants.ts`: the 13 Principles and their colours, the 9 Elements of
the Soul with Principles per evolution level, the 9 Wisdoms in ring order, the 14 flying lines, the 9
Librarians, tier thresholds (5 / 10 / 15), the five seasons, the wiki's chances for each kind of Opportunity
(`OPPORTUNITIES`) and `isMemory`, which says which cards count as memories.

Ids are slugs of the wiki page title; `slug()` exists in both Python and TypeScript and must stay identical.

## Player state (`src/engine/types.ts`, `PlayerState`, schema 4)

`skills` (id -> level 1..9), `tree` (wisdom -> 9 node slots), `soul` (element -> counts at base, +, ++,
+++), `booksMastered`, `itemsOwned`, `stationsUnlocked`, `roomsUnlocked`, `pinnedRecipes`,
`journalCommitted`, `savedPlans` (Tree plans kept under a name: `{ name, tree, journal }`, newest first, one
per name), and `settings` (`librarian`, `librarianVariant`, `weather`, `season`,
`countRoomContents`, `assumeAllStationsUnlocked`, `planMode`, `evolveAll`, `hideUnfound`). `season` is `''` (not chosen),
one of the four seasons, or `Numa`; one setting, shown as five buttons on the Foraging and Hush House pages
and in the Database (the Memories tab and each skill's "Upgrading it" section).

The order of the keys in `booksMastered` is the order in which the books were ticked; the engine reads it as
the order of mastering.

Of the three preferences on the Settings page only `countRoomContents` is on by default; `evolveAll`, set on the
Tree page, is on by default too. A workstation counts as unlocked when its room is
unlocked, `assumeAllStationsUnlocked` is on, or
it is ticked in the Database (`stationUnlocked`).

Export writes the state as JSON; import accepts schema 1 to 4 and passes it through `migrate()`.

`migrate()` in `src/store.ts` upgrades schema 1 saves (which stored the two starting Elements instead of
a Librarian) and gives saves older than schema 3 an empty `savedPlans` and saves older than schema 4 `evolveAll` switched on. Ids in a save that the data no longer
has (an item renamed on the wiki or by `OWNER_ITEM_NAMES`) are ignored, so that tick is lost.

## Engine rules

**Cards.** A soul card has the Principles of its element at its evolution level. A skill at level L has
primary L+1 and secondary L. Items carry the Principles and aspects the wiki lists.

**What I have (`haveMap`).** Items marked owned; contents of unlocked rooms (if `countRoomContents`);
today's weather; the memory given by considering anything already held; the memory of each mastered book
(re-reading always gives it). Each entry records how it is available, shown in the UI. When a memory can be
had in several ways it is credited to the one that costs least: a thing that survives being Considered, then
the book mastered first, then a thing that Considering uses up.

**Craftable things (`addCraftable`, `craftList`).** `makeCtx` then adds the result of every recipe that works
at an unlocked station with what the player has, and the memory from considering it, repeating until nothing
new appears (a crafted thing can be the next recipe's ingredient). `ctx.crafted` maps such items to their
recipe. `craftList` gives every recipe result as held, craftable now, or blocked with what is missing.

**Three bands.**

| Band | Label | Counts |
| --- | --- | --- |
| `self` | Soul & skill | best soul card and best skill only |
| `have` | With what I have | plus anything in `haveMap` that fits a slot |
| `max` | Game maximum | plus the best fitting card that exists in the game |

**Reading (`bestReading`, `readingTable`, `canReadBook`).** For a Principle, take the best station (a
station with a slot that accepts the readable, plus the Consider verb for texts) and the best card per
slot: Soul, Skill, Memory, and the station's other slot (Tool or Ink at a desk). Soul cards and skills
must share a Principle with the station. Languages never fill the Skill slot; a foreign book also needs
its language skill owned. The Memory slot takes any card the wiki files under Memory, including the three the
owner does not count as memories (see `isMemory`); that only shows in the Game maximum band.

**Recipes (`stationQualifies`, `planRecipe`).** A station qualifies when one of the recipe's skills shares a
Principle with it and the ingredient can be placed; it need not carry the recipe's own Principle, whose total
comes from the cards placed. The ingredient goes in the Memory slot, or in an extra slot through any aspect
of a card that carries the wanted aspect, or is satisfied by an Instrument station. Status is `ready` (soul, skill and ingredient reach the threshold), `items`
(reached with what the player has), or `blocked` with the specific gaps; a recipe no station qualifies for is
`nowhere`. Lists show them in that order (`STATUS_RANK`), pinned recipes first.

**Helpers (`helperPool`, `helperBest`).** A helper's Principles plus one boost per kind of card, all added
together: Soul, Beverage, Memory, Sustenance, Tool, and the helper's unique kind. No card is used twice. The
pool is what the player has, which includes what they can craft right now.

**Rooms (`roomStatuses`).** A room is `unlocked`, `openable` (a prerequisite is unlocked and some helper
reaches one of its Principle requirements), `short`, `special` (no Principle requirement), or `beyond`
(no prerequisite unlocked). Among equally good attempts the cheaper helper and fewer boosts win. Six rooms are
not a helper's job: three open with one card of a given aspect (best fitting card the player has), two with a
Circumstance from the pumps and one with the Hush House Key (these three show as `special`). A card-opened
room may also need every Principle in `requiresAlso` on the same card. With no helper to hire (Numa), rooms
that need Assistance are `short` with no plan.

**Foraging (`forageRows`).** Gathering stations are not workstations: `build_data.py` keeps pages in the
wiki's Gathering category out of `workstations.json` and builds `foraging.json` from the Gathering page, the
seasonal decks on the Decks page and the table on the Garden page. A place is available when its room is
unlocked (the moor is outside the house). It accepts an Element of the Soul and a Skill that share one of its
Principles; a Nectar-only garden takes a Heart Element and a Nectar Skill; the well takes no Skill. Card
strength does not matter. Languages never fit. Swimming (Health only) and renouncing a penny at the sea are
listed as foraging places too, parsed from the Sea's Edge and Brancrug Boathouse pages. Where the wiki names
the exact Elements (`soulElements`), those are used. Rows are ordered usable, then reachable without a fitting
card, then locked; with a season chosen only that season's yields are returned, likeliest first.

**Memories for upgrading a skill (`memorySources`, `upgradePlan`).** Upgrading a skill of level N takes the
skill, an Element of the Soul, a Lesson and N memories, each sharing a Principle with the skill; strength does
not matter. `upgradePlan` lists every memory that fits (`isMemory`) with its sources from
`memorySources`: today's weather, Considering a thing (held or not), re-reading a book (mastered, masterable
with what the player has, or beyond), a recipe, a foraging place in the chosen season, and a cache (out of
reach while it lies only in locked rooms). Things that survive being Considered are listed apart from those it uses up, and within each state the
sources that use nothing up come first (`consumes`); mastered books are named in the order they were ticked,
the one mastered first leading. `haveMap` credits a memory the same way: a thing that survives, then the
earliest mastered book, then a thing that is used up. Each source is `ready`, `reachable` or `locked` and carries the
number of memories it is certain to give today: one per thing or book, one per sea place, one per recipe,
nothing for a draw that depends on luck, and nothing from foraging until a season is chosen. Rows are ordered
ready, reachable, locked. The wiki's "Intuition" page is built under the
game's name, Memory: Intuition (`OWNER_ITEM_NAMES` in `build_data.py`), which is also the name books use for it.

**Seasons (`helpersIn`).** Seasonal workers can be hired only in their season, and nobody during Numa.

**Tree (`reachable`, `pickerRows`, `stranded`, `treeIssues`, `treeStats`, `evolve`).** Node rules are under
"Game rules confirmed by the owner" below. A tree is valid when every filled node is connected, through filled neighbours and flying
lines, to a filled first node, and the journal is committed. Loading a preset commits the journal. Statistics: base cards per element = starting cards + journal + one per
committed skill; each committed skill can power one evolution of its element; `evolve` merges pairs
upward while evolutions remain (8 cards and 7 skills reach +++).

## Pages

Hash routes, rendered by `src/App.tsx`. Pages only render engine results; none holds a game rule.

| Route | Page | Notes |
| --- | --- | --- |
| `#/` | Home | The epigraph, the letter with the "I remember...?" choice of Librarian, progress tiles, pinned recipes. Choosing a Librarian also resets the soul cards to that origin's starting hand, but only while the player has not edited them. |
| `#/db/<tab>[/<id>]` | Database | Tabs `books`, `skills`, `items`, `memories`, `workstations`, `caches`. Memories are listed in their own tab, not under items, with where each comes from; a skill's entry shows how many memories its next level takes and the candidates with their sources. Links to a memory go to `#/db/memories/<id>` (`itemHref`, `MemoryLink` in `ui.tsx`). With an id, that row is opened, scrolled into view and listed first, whatever the filters and the 120-row page size (`useFocus`, `focusFirst`); every link into the Database relies on this. The row leads only until the reader changes the search or a filter; after that it is listed like any other. An unknown tab shows the books. Mastered, level, owned and unlocked are edited in place. |
| `#/tracker` | Tracker | Reading table with today's weather, skill levels (each name links to the skill's Database entry), "What I have" (tools and inks in the house, things I can craft, memories), soul cards. |
| `#/crafting[/<id>]` | Crafting | Recipe list and one recipe's workstations. A recipe reached by a link, from another page or from the detail beside the list, is put first in the list and the list scrolls to it, until a filter changes; one picked in the list itself stays where it is. `#/recipes/...` is the old address and still works. |
| `#/foraging` | Foraging | Five season buttons; pressing the chosen one again shows all five seasons side by side. |
| `#/house` | Hush House | Rooms with the best way to open each, and a per-helper table. The same five season buttons as Foraging sit above the rooms and above the helper table. |
| `#/tree` | Tree of Wisdoms | The diagram takes most of the width, the skill picker stays in view beside it and the statistics sit below. Nodes, flying lines, journal at the root, presets. "Save plan…" keeps the current tree and its journal under a name (`savePlan`, `loadPlan`, `deletePlan` in the store); saved plans are loaded from a menu or the list under the diagram, deleted there, and travel with an exported save. "Plan ahead" (`planMode`) ignores owned skills and levels; "evolve as far as possible" (`evolveAll`) shows the hand merged upward. Both are kept in the save. |
| `#/settings` | Settings | Preferences, export, import, reset. |

`hideUnfound` (the spoiler guard) hides the names and descriptions of books not mastered and skills not owned
in the Database lists and on the Tracker, and the names of unmastered books wherever they are listed (books
that teach a skill, books within reach, books that give a memory; `bookName` in `ui.tsx`). Skill names in
recipes and in the Tree's picker are shown regardless: both are for planning ahead.

## Web platform practices

Checked against Chrome's Modern Web Guidance 1.0 (https://github.com/GoogleChrome/modern-web-guidance) on
2026-11-12. Applied:

- Text scaling: font sizes in `rem`, no font size on the root, breakpoints in `em`, and
  `<meta name="text-scale" content="scale">` so the system text size is followed where supported.
- Scrollable tables are focusable, named regions (`TableWrap`).
- Page and Database section links are plain navigation with `aria-current`, not an ARIA tab list.
- `content-visibility: auto` with `contain-intrinsic-size` on the two long card lists (skills, recipes).
- `accent-color` and `scrollbar-color` so checkboxes and scrollbars match the theme.

Considered and left out: view transitions between pages (adds motion to an app whose owner asked for
snappier navigation), `scheduler.yield()` (no task is long any more), `hidden="until-found"` for collapsed
rows (rows are not rendered until opened), font fallback metric matching, and an installable web app manifest.

## Tests (`src/engine/engine.test.ts`)

45 tests, run against the checked-in data: data integrity and descriptions, the wiki's reading example,
language rules, a recipe going from blocked to ready, flying lines, the two preset trees passing every tree
rule, evolution arithmetic, the "what I have" sources, craftable things counting as held, foraging (seasons,
accepted cards, order), caches, the sea and Numa, Librarians, save migration and saved Tree plans, memories for upgrading a skill (count, fit, order, sources by season), and helper and room logic
(boost stacking, card-opened rooms, every room reachable from the Cucurbit Bridge).

There are no browser tests in the repository; pages were checked by hand in headless Firefox.

## Decisions made by the owner

- The wiki is the only data source; no data from game files.
- Repository licence: CC BY-SA 3.0 Unported, the same as the wiki text. Legal code in `LICENSE`, attribution
  and exclusions in `NOTICE.md`.
- Item scope: items that can give a memory, help master a book, or fit a workstation slot.
- Wiki icons ship by default; `VITE_ICONS=off` builds without them. They are Weather Factory's artwork and
  are not covered by the repository licence (`public/icons/NOTICE.txt`).
- Served from a sub-path of the owner's GitHub Pages site and reached by its direct address only; the
  owner's main site does not link to it. Deployment needs the repository's Pages source set to
  "GitHub Actions".
- State stays in the browser, no server. `localStorage` is used instead of a cookie (4 KB cap).
- The UI should look like the game: dark background, parchment panels, serif headings, game icons.
- The village, its shops and the ocean are left out of the Hush House page (they open during the
  introductory story).

## Game rules confirmed by the owner

Where the wiki and the owner disagree, the owner's rule wins and is recorded here.

- A soul card or skill fits a workstation only if it shares at least one Principle with it.
- A recipe can be made at any workstation that fits one of its skills and has a slot for its ingredient, even
  if the workstation lacks the recipe's Principle (Gervinite through Sky is made at the Alchemist's Glassware
  or the Oubliette Containment, with Sky supplied by the cards). An ingredient enters a slot through any of its
  aspects: a Metal as a Material, an Egg as Sustenance.
- The Soul and Skill slots need a card that shares a Principle with the workstation. The Memory slot and the
  two extra slots ask only for a kind of card (Memory, Metal, Tool, an Element of the Soul, ...); its Principles
  need not match the workstation's.
- A language skill only unlocks books in that language. It never fills the Skill slot, adds no Principles
  and is used in no recipe. It can be committed to the Tree.
- Tree: the node at level n accepts a skill of level n or higher.
- Tree: the journal must be committed at the root first. That opens the first node of every Wisdom and
  grants the journal's Element of the Soul. Mastering the journal as a book only gives its lessons.
- Tree: a further node is reachable if a neighbouring node on its branch (above or below) is filled, or the
  node at the other end of a flying line is filled.
- Tree: a committed language can evolve its Element of the Soul like any other committed skill.
- The 14 flying lines in `src/engine/constants.ts` (`TREE_LINKS`) were read from an in-game screenshot and
  confirmed one by one.
- Helpers: boosts of different kinds of card add up, one card per kind (Element of the Soul, Beverage,
  Memory, Sustenance, Tool, plus the unique material some helpers accept), as the wiki says.
- No helper can be hired during Numa.
- The Rowenarium is reached from the Upper Pump Room. The wiki's Locations table says Lower Pump Room; the
  override is `OWNER_PREREQUISITES` in `scripts/build_data.py`.
- Room requirements where the room page and the wiki's Locations table disagree: the room page is right for
  the Glorious Stair (Edge, Forge or Winter 6), the Radiant Stair (Edge, Forge, Knock or Lantern 6) and the
  Keeper's Lodge (Forge 2, Heart 1 or Knock 1). The table is right for the Stair Tenebrous: a non-Weather
  Memory with Edge 3 and 3 of one of the other listed Principles (`OWNER_REQUIRES_ALSO` in `build_data.py`).
- The sea counts as foraging: swimming with Health gives Memory: Salt (plus Memory: Solace with a Basket of
  Towels, which cannot be used in Numa). In Numa swimming gives Curious Hunch instead of Memory: Salt, at
  the Sea's Edge as at the Boathouse, although the Sea's Edge page says "additionally". A penny renounced
  at the Sea's Edge gives Memory: Impulse (Horizon-Sight in Numa). Discarding things there is not tracked.
- The Barber's Chair takes an Element of the Soul and a Memory in its two extra slots (the wiki lists Liquid
  and Fuel; `OWNER_SLOTS` in `build_data.py`).
- Upgrading a skill of level N (1 to 8) takes the skill, an Element of the Soul, a Lesson and N memories;
  each card needs at least one of the skill's Principles.
- A Lesson of Many Facets (a special Lesson), Avenue of Enquiry and An Offering to St Tentreto are not
  memories, although the wiki files them under Memory (`isMemory` in `constants.ts`). They are listed under
  Items, not Memories, and are not offered for upgrading a skill.
- The memory the wiki titles "Intuition" is called Memory: Intuition in the game and carries Moon 2 and
  Rose 2 (`OWNER_ITEM_NAMES` in `build_data.py`; the Principles are the wiki's own).
- Anything the player can craft right now counts as something they have, craftable memories included (for
  example Torgue's Cleansing).

## Known gaps and data caveats

- Room prerequisites merge two wiki sources: the "Opening it exposes" sentence on each room page and the
  "Prerequisite Location" column of the Locations page. A test checks that every room can be reached from
  the Cucurbit Bridge, and the owner has accepted the resulting order.
- Cucurbit Bridge and Crowcross Sands have no prerequisite on the wiki, so they always show as reachable;
  the bridge is the intended starting point.
- "Count things lying in unlocked rooms" assumes nothing has been used up.
- "Things I can craft" counts each craftable thing on its own, although crafting one may consume a card
  another needs.
- The reading and recipe numbers ignore the random Opportunities on failure; they are guaranteed minimums.
  When no unread book is within guaranteed reach, the Tracker says so and quotes the wiki's chances for each
  kind of Opportunity card (`OPPORTUNITIES` in `constants.ts`).
- Caches are reference only: they are not items, cannot be marked owned and feed no calculation. Chances are
  equal shares of the list on each cache's page unless the page gives a weight. The cut-content Souvenir
  Cache is left out.
- Foraging leaves out discarding things and releasing beasts, the Loading Dock Crane (no swimming, no
  penny), the alternative Beehive deck from the House of Light DLC, and the wiki's "Chrysalis" deck, which
  no page explains. Foraged things do not count as things the player has.
- Memories for upgrading a skill: Lessons are not tracked, so the app cannot say whether one is to hand. The
  "Today" count assumes each thing or book gives its memory once a day and that nothing has been used up. One
  memory, Memory: Loss, has no source the app can work out (it comes from discarding things into the sea,
  which is not tracked); its entry shows what the wiki page mentions instead.
- Loading a saved Tree plan does not switch on "plan ahead", so a plan with skills not yet owned or too low
  shows those nodes as breaking a rule.
- One book, The Radical Measure (Glossed), has no period on the wiki. Books are shown without cover pictures, by the
  owner's choice.
- On a phone the Tree diagram is wider than the screen and scrolls sideways, so that its nodes stay large
  enough to tap.

## Sources

- Book of Hours Wiki: https://book-of-hours.fandom.com (CC BY-SA)
- Steam guide "Minmax'd Wisdom Trees et al." by SCPantera:
  https://steamcommunity.com/sharedfiles/filedetails/?id=3173709809
