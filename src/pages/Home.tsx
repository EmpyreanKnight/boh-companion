import { useMemo } from 'react';
import { ItemIcon, P, Panel, Soul, Status } from '../components/ui';
import { element, LIBRARIANS, wisdom } from '../engine/constants';
import { defaultPlayer, startingSoul } from '../engine/defaults';
import { librarianOf, placement, readingTable, recipeStatus, startElements, STATUS_RANK } from '../engine/engine';
import { PinButton, STATUS_LABEL } from './Crafting';
import type { ElementId, GameData, LibrarianId } from '../engine/types';
import { useCtx, usePlayer } from '../store';

export function Home({ data }: { data: GameData }) {
  const player = usePlayer();
  const ctx = useCtx(data);
  const rows = useMemo(() => readingTable(ctx), [ctx]);
  const pinned = data.recipes.filter((r) => player.pinnedRecipes[r.id])
    .sort((a, b) => STATUS_RANK[recipeStatus(ctx, a)] - STATUS_RANK[recipeStatus(ctx, b)]);
  const rooms = Object.keys(player.roomsUnlocked).length;
  const owned = Object.keys(player.skills).length;
  const mastered = Object.keys(player.booksMastered).length;
  const committed = Object.keys(placement(player.tree)).length;
  const readable = rows.reduce((n, r) => n + r.unlocked.have.length, 0);
  const tiles: [string, string, string, string][] = [
    [`${mastered} / ${data.books.length}`, 'books mastered', '#/db/books', 'Open the book list'],
    [`${owned} / ${data.skills.length}`, 'skills learnt', '#/tracker', 'Record skills and soul cards'],
    [`${readable}`, 'unread books you can master with what you have', '#/tracker', 'See the reading calculator'],
    [`${rooms} / ${data.rooms.length}`, 'rooms unlocked', '#/house', 'Open the Hush House page'],
    [`${committed} / 73`, 'skills committed to the Tree', '#/tree', 'Open the Tree of Wisdoms'],
  ];
  const lib = librarianOf(player);
  const start = startElements(player);
  const fresh = JSON.stringify(player.soul) === JSON.stringify(startingSoul(player.settings.librarian, player.settings.librarianVariant))
    || JSON.stringify(player.soul) === JSON.stringify(defaultPlayer().soul);
  const choose = (id: LibrarianId, variant: ElementId | null) => {
    // keep the soul cards in step while the player has not edited them
    if (fresh) for (const [e, row] of Object.entries(startingSoul(id, variant))) row.forEach((n, lvl) => player.setSoul(e as ElementId, lvl, n));
    player.setSetting('librarian', id); player.setSetting('librarianVariant', variant);
  };
  return (
    <>
      <blockquote className="epigraph">Books are the memory that does not die.</blockquote>

      <section className="letter">
        <p className="letter-date">Brancrug, March 7th, 1936</p>
        <p>'There has been no Librarian at Hush House since the fire - seven years now. Suitable candidates are very difficult to find,
          but perhaps we have found one in you. Take care on your journey - the seas around Brancrug are treacherous...'</p>
        <h2 id="remember">I remember...?</h2>
        <div className="origins" role="radiogroup" aria-labelledby="remember">
          {LIBRARIANS.map((l) => (
            <button key={l.id} role="radio" aria-checked={l.id === lib.id} className={l.id === lib.id ? 'on' : ''}
              onClick={() => choose(l.id, l.choice?.[0] ?? null)}>{l.name}</button>))}
        </div>
        {lib.choice && <p className="row">...and at the Beginning I also chose
          {lib.choice.map((x) => <button key={x} className={start[start.length - 1] === x ? 'on' : ''} aria-pressed={start[start.length - 1] === x}
            onClick={() => choose(lib.id, x)}>{element(x).name}</button>)}</p>}
        <p className="small">I was <b>{lib.name}</b>. I began with <Soul id="health" />{start.map((e) => <span key={e}>, <Soul id={e} /></span>)}.
          {' '}My journal is the <b>{lib.journal.name}</b>, which grants <Soul id={lib.journal.element} /> when committed at the root of the <a href="#/tree">Tree</a>;
          {' '}it suggests beginning with {wisdom(lib.wisdom).name}.</p>
      </section>

      <Panel title={`${lib.name}'s desk`}>
        <p className="lede">A companion for <i>Book of Hours</i>: a database of books, skills, items and workstations, and planners
          that read the progress you record here.</p>
        <div className="tiles">
          {tiles.map(([n, label, href, cta]) => (
            <a key={label} className="tile" href={href}><b>{n}</b><span>{label}</span><em>{cta} →</em></a>
          ))}
        </div>
      </Panel>
      <Panel title={`Pinned recipes (${pinned.length})`}>
        {pinned.length ? <ul className="pinned-list">{pinned.map((r) => { const st = recipeStatus(ctx, r); return (
          <li key={r.id}><ItemIcon item={data.itemById[r.result]} size={30} /><a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName}</a>
            <span className="muted small"><P id={r.principle} short /> {r.tier}</span><Status kind={st}>{STATUS_LABEL[st]}</Status><PinButton id={r.id} name={r.resultName} /></li>); })}</ul>
          : <p className="muted">Nothing pinned. Use the ☆ next to a recipe on the <a href="#/crafting">Crafting</a> page to keep it here.</p>}
      </Panel>
      <Panel title="Where to start">
        <ol className="steps">
          <li>Above: remember which Librarian you were.</li>
          <li><a href="#/tracker">Tracker</a>: set the level of each skill you own, the soul cards you hold and today's weather.</li>
          <li><a href="#/house">Hush House</a>: tick the rooms you have unlocked and see which you can open next.</li>
          <li><a href="#/db/books">Database → Books</a>: tick the books you have mastered.</li>
          <li><a href="#/crafting">Crafting</a>: pick something to craft and see which workstations can make it today.</li>
          <li><a href="#/foraging">Foraging</a>: see what the gardens, the beach and the moor yield this season.</li>
          <li><a href="#/tree">Tree of Wisdoms</a>: click a node to commit a skill, or load a preset plan.</li>
        </ol>
      </Panel>
    </>
  );
}
