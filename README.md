# Book of Hours Companion

An unofficial companion for [*Book of Hours*](https://www.weatherfactory.biz/book-of-hours/) by Weather
Factory. It keeps track of your library and answers the questions that come up while playing: can I read
this book yet, where can I craft that, which room can I open next, what grows in the garden this season.

**Open it here: https://empyreanknight.github.io/boh-companion/**

It runs entirely in your browser. There is no account and no server; your progress is saved in the
browser you use and is never sent anywhere.

> The app describes the whole game: every book, room, recipe and the full Tree of Wisdoms. Settings has a
> spoiler guard that hides the names of books you have not mastered and skills you do not own.

## What it does

| Page | What you get |
| --- | --- |
| **Home** | Choose which Librarian you were, see your progress at a glance, and keep pinned recipes in view. |
| **Database** | Books, skills, items, memories, workstations and caches, with their in-game descriptions. Tick the books you have mastered and the things you own. A skill's entry lists the memories that will upgrade it and where to get each. |
| **Tracker** | The highest Mystery you can read in each Principle, your skill levels, and what you have to hand: tools, things you can craft right now, and memories you can call up today. |
| **Crafting** | Every recipe, the workstations that can make it, the cards to place in each slot, and what is still missing. |
| **Foraging** | The beach, the moor, the gardens and the other gathering places: what each yields in each season, Numa included, and whether you can go there yet. |
| **Hush House** | Every room, what unlocks it, and the cheapest helper and boosts that will open it with what you have. |
| **Tree of Wisdoms** | Plan which skill to commit where, with the game's reach rules checked for you, preset plans, your own plans saved under a name, and the Elements of the Soul the plan produces. |
| **Settings** | The spoiler guard, a few counting preferences, and export, import or reset of your save. |

## Getting started

1. On **Home**, pick your Librarian under "I remember...?".
2. On **Tracker**, set the level of each skill you have and today's weather.
3. On **Hush House**, tick the rooms you have unlocked. Tools lying in those rooms are counted for you.
4. In **Database → Books**, tick the books you have mastered.

Everything else follows from that. To move your progress to another browser or keep a backup, use
*Export save* and *Import save* in Settings. Clearing the browser's site data erases your progress.

## Accuracy

The game data comes from the community-written [Book of Hours Wiki](https://book-of-hours.fandom.com), read
on the date shown at the foot of every page. Where the wiki is incomplete or wrong, so is this app; known
gaps are listed in [`docs/DESIGN.md`](docs/DESIGN.md). Numbers such as "can I read it?" are guaranteed
minimums: they ignore the lucky Opportunities the game sometimes grants.

## For developers

A static site built with React, TypeScript and Vite. The deploy workflow builds it with Node.js 22.

```bash
npm install
npm run dev        # http://127.0.0.1:5173/
npm test           # rules-engine tests
npm run build      # static site in dist/
```

[`docs/DESIGN.md`](docs/DESIGN.md) explains the architecture and the rules engine, and records the game
rules the owner has confirmed and known gaps.

Game data is checked in under `public/data/`. To refresh it from the wiki (Python 3, run by hand):

```bash
python3 scripts/crawl.py             # wiki -> data-src/raw/pages.json
python3 scripts/fetch_icons.py       # Principle, soul and Wisdom icons -> public/icons/
python3 scripts/fetch_card_icons.py  # skill, item and helper icons -> public/icons/
python3 scripts/build_data.py        # raw pages -> public/data/*.json (run after the icon scripts)
```

Pushing to `main` runs the tests and publishes the site to GitHub Pages through
`.github/workflows/pages.yml`.

## Credits and licence

- *Book of Hours*, its names, text and artwork belong to Weather Factory. This is a fan project, not
  affiliated with or endorsed by them. The icons in `public/icons/` are their artwork and are not covered by
  this repository's licence; build with `VITE_ICONS=off` to leave them out.
- Game data is derived from the [Book of Hours Wiki](https://book-of-hours.fandom.com), written by its
  contributors, CC BY-SA.
- The preset trees come from the Steam guide
  [Minmax'd Wisdom Trees et al.](https://steamcommunity.com/sharedfiles/filedetails/?id=3173709809) by
  SCPantera, and the "Tree of OCDs" by wiki user AllNamesTaken1.

The repository is licensed under CC BY-SA 3.0 Unported. The legal code is in [`LICENSE`](LICENSE);
[`NOTICE.md`](NOTICE.md) lists attribution and what the licence does not cover.
