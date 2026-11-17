# Book of Hours Companion

Unofficial, client-only companion web app for the game *Book of Hours* (Weather Factory).
Static site: React + TypeScript + Vite, deployed to GitHub Pages under a sub-path. No server; player
progress lives in the browser's `localStorage`.

Read `docs/DESIGN.md` first: it describes the architecture and the rules engine, and records the owner's
decisions, the game rules the owner has confirmed and known gaps.

## Commands

```bash
npm install
npm run dev      # http://127.0.0.1:5173/
npm test         # vitest: rules-engine tests (must stay green)
npm run build    # tsc --noEmit + vite build -> dist/
```

Refreshing game data (needs Python 3 and network access to the wiki; run by hand, not in CI):

```bash
python3 scripts/crawl.py             # wiki wikitext -> data-src/raw/pages.json (--pages: only the PAGES list, merged in)
python3 scripts/fetch_icons.py       # Principle, soul, Wisdom icons -> public/icons/
python3 scripts/fetch_card_icons.py  # skill, item, helper icons -> public/icons/
python3 scripts/build_data.py        # raw pages -> public/data/*.json (run last: it flags which icons exist)
```

## Layout

- `src/engine/` — pure TypeScript rules, no React. `engine.ts` (cards, "what I have", reading, recipes,
  helpers, rooms, foraging, memories for upgrading a skill, tree), `constants.ts` (Principles, soul elements, Wisdoms, flying lines, Librarians),
  `presets.ts` (preset trees), `data.ts` (load and index JSON), `defaults.ts`, `types.ts`,
  `engine.test.ts`.
- `src/store.ts` — Zustand store persisted to `localStorage` key `boh-companion:player:v1`
  (persist version 4), `migrate()`, export/import.
- `src/pages/` — `Home`, `Database`, `Tracker`, `Crafting`, `Foraging`, `House`, `Tree`, `Settings`.
- `src/components/ui.tsx` — shared chips, icons, panel, stepper, hash router hook.
- `scripts/` — Python crawler and data builder. `data-src/raw/pages.json` is the cached crawl.
- `public/data/*.json` — generated game data (checked in). `public/icons/` — wiki artwork (see NOTICE.txt).
- `.github/workflows/pages.yml` — test, build with `BASE_PATH=/<repo>/`, deploy to Pages.

## Conventions

- Game rules go in `src/engine/` with a test; pages only render engine results.
- Never hand-edit `public/data/*.json`; change `scripts/build_data.py` and regenerate.
- Changing the shape of `PlayerState` means bumping the persist version and extending `migrate()` in
  `src/store.ts`, with a test, so existing saves keep loading.
- All URLs are relative to Vite's `base` (`import.meta.env.BASE_URL`); no absolute `/` paths.
- Hash routing only (`#/tree`), because GitHub Pages has no server rewrites.
- Use the game's own terms in the UI (Mystery, Principle, Prentice/Scholar/Keeper, Commit, Evolve).
- Principles are never shown by colour alone; every chip carries its name or a title.
- Text sizes in CSS are in `rem` and the root font size is never set, so the reader's text size applies
  (the SVG Tree is the exception: its sizes are drawing units).
- Wide tables go in `<TableWrap label="...">` (keyboard-scrollable, named region). Links that change the
  address are navigation (`aria-current="page"`), not ARIA tabs.
- Data comes from the wiki only (the owner's decision); do not add data extracted from game files.
- When the wiki and the owner disagree about a game rule, the owner's confirmed rule wins; record it in
  `docs/DESIGN.md`.
