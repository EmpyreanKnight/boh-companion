import { useEffect, useMemo, useState } from 'react';
import { ItemIcon, itemHref, Lore, MemoryLink, P, Panel, PList, PrincipleFilter, SeasonPicker, SkillIcon, Soul, Status, Stepper, TableWrap, WisdomName } from '../components/ui';
import { ALL_SEASONS, wisdom } from '../engine/constants';
import { canReadBook, skillPrinciples, stationQualifies, stationUnlocked, memorySources, upgradePlan, type MemorySource } from '../engine/engine';
import type { Book, GameData, Item, PrincipleId, Skill, Workstation } from '../engine/types';
import { useCtx, usePlayer } from '../store';

const TABS = [['books', 'Books'], ['skills', 'Skills'], ['items', 'Items'], ['memories', 'Memories'], ['workstations', 'Workstations'], ['caches', 'Caches']] as const;
const PAGE = 120;

export function Database({ data, path }: { data: GameData; path: string }) {
  const tab = (path.split('/')[2] ?? 'books') as (typeof TABS)[number][0];
  const focus = path.split('/')[3] ?? null;
  const [q, setQ] = useState('');
  const [p, setP] = useState<PrincipleId | ''>('');
  return (
    <Panel title="Database" actions={
      <input className="search" type="search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name" />}>
      {/* these change the address, so they are navigation links, not an ARIA tab list */}
      <nav className="tabs" aria-label="Database sections">
        {TABS.map(([id, label]) => <a key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'on' : ''} href={`#/db/${id}`}>{label}</a>)}
      </nav>
      <PrincipleFilter value={p} onChange={setP} />
      {tab === 'books' && <Books data={data} q={q} p={p} focus={focus} />}
      {tab === 'skills' && <Skills data={data} q={q} p={p} focus={focus} />}
      {tab === 'items' && <Items data={data} q={q} p={p} focus={focus} />}
      {tab === 'memories' && <Memories data={data} q={q} p={p} focus={focus} />}
      {tab === 'workstations' && <Stations data={data} q={q} p={p} focus={focus} />}
      {tab === 'caches' && <Caches data={data} q={q} p={p} focus={focus} />}
    </Panel>
  );
}

const match = (name: string, q: string) => name.toLowerCase().includes(q.trim().toLowerCase());
type Props = { data: GameData; q: string; p: PrincipleId | ''; focus: string | null };

/** Open the row a link points at (`#/db/items/<id>`) and bring it into view. */
function useFocus(focus: string | null, setOpen: (id: string) => void) {
  useEffect(() => {
    if (!focus) return;
    setOpen(focus);
    document.getElementById(`row-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus]);   // eslint-disable-line react-hooks/exhaustive-deps
}
/** The linked row goes first, so it shows whatever the filters and the page size are. */
function focusFirst<T extends { id: string }>(rows: T[], all: T[], focus: string | null): T[] {
  const f = focus ? all.find((x) => x.id === focus) : undefined;
  return f ? [f, ...rows.filter((x) => x !== f)] : rows;
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return <p className="muted count">{Math.min(shown, total)} of {total} shown{shown < total && <> · <button className="link" onClick={onMore}>show more</button></>}</p>;
}

function Books({ data, q, p, focus }: Props) {
  const player = usePlayer();
  const [state, setState] = useState<'all' | 'unread' | 'readable' | 'mastered'>('all');
  const [lang, setLang] = useState('');
  const [open, setOpen] = useState<string | null>(focus);
  const [n, setN] = useState(PAGE);
  const ctx = useCtx(data);
  const reads = useMemo(() => new Map(data.books.map((b) => [b.id, canReadBook(ctx, b)])), [ctx, data]);
  const langs = useMemo(() => [...new Set(data.books.map((b) => b.languageName).filter(Boolean))].sort() as string[], [data]);
  useFocus(focus, setOpen);
  const rows = focusFirst(data.books.filter((b) => {
    const m = !!player.booksMastered[b.id];
    if (p && b.principle !== p) return false;
    if (lang && b.languageName !== lang) return false;
    if (state === 'mastered' && !m) return false;
    if (state === 'unread' && m) return false;
    if (state === 'readable' && (m || !['self', 'have'].includes(reads.get(b.id)!.band ?? ''))) return false;
    return match(b.name, q) || (b.lesson && match(data.skillById[b.lesson.skill].name, q));
  }).sort((a, b) => a.mystery - b.mystery || a.name.localeCompare(b.name)), data.books, focus);
  const hide = (b: Book) => player.settings.hideUnfound && !player.booksMastered[b.id];
  return (
    <>
      <div className="row filters">
        <label>Show <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
          <option value="all">all books</option><option value="unread">not mastered</option>
          <option value="readable">not mastered, readable with what I have</option><option value="mastered">mastered</option></select></label>
        <label>Language <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="">any</option>{langs.map((l) => <option key={l}>{l}</option>)}</select></label>
      </div>
      <More shown={n} total={rows.length} onMore={() => setN(n + PAGE)} />
      <TableWrap label="Books"><table>
        <thead><tr><th>Mastered</th><th>Book</th><th>Mystery</th><th>Language</th><th>Type</th><th>Lesson</th><th>Memory</th><th>Can I read it?</th></tr></thead>
        <tbody>{rows.slice(0, n).map((b) => {
          const r = reads.get(b.id)!;
          const m = !!player.booksMastered[b.id];
          return [
            <tr key={b.id} id={`row-${b.id}`} className={open === b.id ? 'open' : ''}>
              <td><input type="checkbox" checked={m} onChange={() => player.toggle('booksMastered', b.id)} aria-label={`Mastered: ${b.name}`} /></td>
              <td><button className="link name" onClick={() => setOpen(open === b.id ? null : b.id)}>{hide(b) ? `Unfound ${b.type.toLowerCase()}` : b.name}</button></td>
              <td><P id={b.principle} value={b.mystery} /></td>
              <td>{b.languageName ?? '—'}{b.language && (player.skills[b.language] ? '' : ' (unknown)')}</td>
              <td>{b.type}</td>
              <td>{b.lesson ? `${b.lesson.count} × ${data.skillById[b.lesson.skill].name}` : '—'}</td>
              <td><MemoryLink data={data} name={b.memory} /></td>
              <td>{m ? <span className="muted">re-read freely</span>
                : !r.language ? <Status kind="blocked">needs {b.languageName}</Status>
                : r.band === 'self' ? <Status kind="ready">yes, soul &amp; skill</Status>
                : r.band === 'have' ? <Status kind="items">yes, with what I have</Status>
                : r.band === 'max' ? <Status kind="blocked">only with things I lack</Status>
                : <Status kind="blocked">short by {b.mystery - r.solution.total}</Status>}</td>
            </tr>,
            open === b.id && (
              <tr key={b.id + ':d'} className="detail"><td colSpan={8}>
                {!hide(b) && <Lore text={b.description} />}
                {m ? <ReadTexts b={b} /> : !hide(b) && <details className="spoiler"><summary>What the book says (not mastered yet)</summary><ReadTexts b={b} /></details>}
                <p><b>{b.period ?? 'Unknown period'}</b>{b.tally != null && <> · price {b.tally}</>}{b.multitudinous && ' · Multitudinous'}</p>
                <p>Best today at <b>{r.solution.station?.name ?? '—'}</b>: {r.solution.total} of {b.mystery} <P id={b.principle} short />.</p>
                <ul className="picks">{r.solution.picks.map((k, i) => <li key={i}><span className="slot">{k.slot}</span> {k.card ? <>{k.card.name} <b>+{k.value}</b>{k.card.via && <span className="muted small"> ({k.card.via})</span>}</> : <span className="muted">empty</span>}</li>)}</ul>
              </td></tr>),
          ];
        })}</tbody>
      </table></TableWrap>
    </>
  );
}

/** The two texts the game shows for a book: on starting to read it, then on mastering it. */
function ReadTexts({ b }: { b: Book }) {
  return (<>
    {b.reading && <><h4>I'm reading...</h4><Lore text={b.reading} /></>}
    {b.read && <><h4>I've read...</h4><Lore text={b.read} /></>}
  </>);
}

function Skills({ data, q, p, focus }: Props) {
  const player = usePlayer();
  const [open, setOpen] = useState<string | null>(focus);
  useFocus(focus, setOpen);
  const rows = focusFirst(data.skills.filter((s) => (!p || s.primary === p || s.secondary === p) && match(s.name, q)), data.skills, focus);
  return (
    <>
      <p className="muted count">{rows.length} of {data.skills.length} shown</p>
      <TableWrap label="Skills"><table>
        <thead><tr><th>Level</th><th>Skill</th><th>Principles now</th><th>Wisdom → Element</th><th>Taught by</th></tr></thead>
        <tbody>{rows.map((s) => {
          const lvl = player.skills[s.id] ?? 0;
          const books = data.books.filter((b) => b.lesson?.skill === s.id);
          const hidden = player.settings.hideUnfound && !lvl;
          return [
            <tr key={s.id} id={`row-${s.id}`} className={open === s.id ? 'open' : ''}>
              <td><Stepper value={lvl} onChange={(n) => player.setSkill(s.id, n)} label={`${s.name} level`} /></td>
              <td><span className="withicon"><SkillIcon skill={s} size={30} /><button className="link name" onClick={() => setOpen(open === s.id ? null : s.id)}>{hidden ? 'Unfound skill' : s.name}</button></span>{s.isLanguage && <span className="tag">Language</span>}</td>
              <td>{lvl ? <PList map={skillPrinciples(s, lvl)} /> : <span className="chips"><P id={s.primary} /><P id={s.secondary} /></span>}</td>
              <td>{s.commit.map((c) => <div key={c.wisdom}><WisdomName id={c.wisdom} name={wisdom(c.wisdom).name} /> → <Soul id={c.element} /></div>)}</td>
              <td>{books.length ? `${books.length} book${books.length > 1 ? 's' : ''}` : s.isLanguage ? 'a tutor' : '—'}</td>
            </tr>,
            open === s.id && <tr key={s.id + ':d'} className="detail"><td colSpan={5}>{!hidden && <Lore text={s.description} />}<SkillDetail data={data} s={s} books={books} hidden={hidden} /></td></tr>,
          ];
        })}</tbody>
      </table></TableWrap>
    </>
  );
}

function SkillDetail({ data, s, books, hidden }: { data: GameData; s: Skill; books: Book[]; hidden: boolean }) {
  const recipes = data.recipes.filter((r) => r.skills.includes(s.id));
  return (
    <>
    {!hidden && <div className="cols attune">{s.commit.map((c) => (
      <div key={c.wisdom}><h4>Committed to <WisdomName id={c.wisdom} name={wisdom(c.wisdom).name} /> → <Soul id={c.element} /></h4>
        {c.title && <p className="attune-title">{c.title}</p>}
        <Lore text={c.text} /></div>))}</div>}
    <div className="cols">
      <div><h4>Books that teach it</h4>
        {books.length ? <ul>{books.map((b) => <li key={b.id}><a href={`#/db/books/${b.id}`}>{b.name}</a> <P id={b.principle} value={b.mystery} short /> × {b.lesson!.count}</li>)}</ul> : <p className="muted">None.</p>}
        {s.specialties.length > 0 && <p>Specialty: {s.specialties.join(', ')}</p>}</div>
      <div><h4>Recipes</h4>
        {s.isLanguage ? <p className="muted">Languages are not used in crafting; they unlock books and can be committed to the Tree.</p>
          : recipes.length ? <ul>{recipes.map((r) => <li key={r.id}><a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName}</a> <span className="muted">({r.tier}, <P id={r.principle} short />)</span></li>)}</ul> : <p className="muted">None.</p>}</div>
    </div>
    <Upgrade data={data} s={s} />
    </>
  );
}

const isMemory = (i: Item) => i.aspects.includes('Memory');
const SOURCE_LABEL = { ready: 'Now', reachable: 'Within reach', locked: 'Not yet' } as const;
const SOURCE_KIND = { ready: 'ready', reachable: 'items', locked: 'blocked' } as const;

/** The ways of getting one memory, the ones open today first. */
function Sources({ sources }: { sources: MemorySource[] }) {
  const hide = usePlayer((s) => s.settings.hideUnfound);
  return (
    <ul className="sources">{sources.map((x, i) => {
      // the spoiler guard keeps the names of unmastered books out of sight
      const things = x.kind === 'reread' && x.state !== 'ready' && hide ? undefined : x.things;
      const names = things?.map((t, j) => <span key={t.href}>{j > 0 && ', '}<a href={t.href}>{t.name}</a></span>);
      return (
        <li key={i}><Status kind={SOURCE_KIND[x.state]}>{SOURCE_LABEL[x.state]}</Status>{' '}
          {x.href ? <a href={x.href}>{x.label}</a> : x.label}{x.count > 1 && <b> ×{x.count}</b>}
          {x.note && <span className="muted small"> ({x.note})</span>}
          {names && (names.length <= 3 ? <span className="small">: {names}</span>
            : <details className="inline"><summary className="small muted">which</summary><div className="small">{names}</div></details>)}
        </li>);
    })}</ul>);
}

function Memories({ data, q, p, focus }: Props) {
  const player = usePlayer();
  const ctx = useCtx(data);
  const [open, setOpen] = useState<string | null>(focus);
  useFocus(focus, setOpen);
  const season = ALL_SEASONS.includes(player.settings.season) ? player.settings.season : '';
  const all = useMemo(() => data.items.filter(isMemory), [data]);
  const rows = focusFirst(all.filter((i) => (!p || (i.principles[p] ?? 0) > 0) && match(i.name, q))
    .sort((a, b) => (p ? (b.principles[p] ?? 0) - (a.principles[p] ?? 0) : 0) || a.name.localeCompare(b.name)), all, focus);
  const used = (m: Item) => data.recipes.filter((r) => r.ingredient?.item === m.id);
  return (
    <>
      <div className="row filters">
        <span>Current season</span>
        <SeasonPicker value={season} seasons={ALL_SEASONS} onChange={(v) => player.setSetting('season', v)} />
        <span className="muted small">Decides what the sea and the foraging places give. A skill's entry lists the memories that upgrade it.</span>
      </div>
      <p className="muted count">{rows.length} of {all.length} shown</p>
      <TableWrap label="Memories"><table className="memories">
        <thead><tr><th>Held</th><th>Memory</th><th>Principles</th><th>Kind</th><th>Where it comes from</th></tr></thead>
        <tbody>{rows.map((m) => {
          const sources = memorySources(ctx, m, season);
          const now = sources.filter((x) => x.state === 'ready');
          return [
            <tr key={m.id} id={`row-${m.id}`} className={open === m.id ? 'open' : ''}>
              <td><input type="checkbox" checked={!!player.itemsOwned[m.id]} onChange={() => player.toggle('itemsOwned', m.id)} aria-label={`Held: ${m.name}`} /></td>
              <td><span className="withicon"><ItemIcon item={m} size={30} /><button className="link name" onClick={() => setOpen(open === m.id ? null : m.id)}>{m.name}</button></span></td>
              <td><PList map={m.principles} short /></td>
              <td className="small">{m.aspects.filter((a) => a !== 'Memory' && !a.includes('#')).join(', ') || '—'}</td>
              <td className="small">{now.length ? <><Status kind="ready">Now</Status> {now.map((x) => x.label).join('; ')}</>
                : sources.length ? <span className="muted">{sources.length} {sources.length === 1 ? 'way' : 'ways'}, none open today</span>
                : <span className="muted">not worked out</span>}</td>
            </tr>,
            open === m.id && <tr key={m.id + ':d'} className="detail"><td colSpan={5}><Lore text={m.description} />
              <h4>Where it comes from</h4>
              {sources.length ? <Sources sources={sources} /> : <p className="muted">No source could be worked out from the wiki's tables.</p>}
              {m.sources.length > 0 && <p className="small muted">The wiki's page mentions: {m.sources.join(' · ')}</p>}
              {used(m).length > 0 && <><h4>Used as an ingredient in</h4>
                <ul>{used(m).map((r) => <li key={r.id}><a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName}</a> <span className="muted">({r.tier})</span></li>)}</ul></>}
            </td></tr>,
          ];
        })}</tbody>
      </table></TableWrap>
    </>
  );
}

/** What the next level of a skill takes: how many memories, which ones fit and where each comes from. */
function Upgrade({ data, s }: { data: GameData; s: Skill }) {
  const player = usePlayer();
  const ctx = useCtx(data);
  const [all, setAll] = useState(false);
  const season = ALL_SEASONS.includes(player.settings.season) ? player.settings.season : '';
  const plan = upgradePlan(ctx, s.id, season)!;
  const shown = plan.rows.filter((r) => all || r.state !== 'locked');
  const either = plan.principles.length > 1 ? 'either Principle' : 'the Principle';
  return (
    <div className="upgrade">
      <h4>Upgrading it</h4>
      {plan.level >= 9 ? <p className="muted">At level 9 it cannot go higher.</p> : <>
        <p>{plan.level > 0
          ? <>From level {plan.level} to {plan.level + 1} takes <b>{plan.need} {plan.need === 1 ? 'memory' : 'memories'}</b></>
          : <>Each upgrade takes <b>one memory per level</b> the skill has (you do not own it yet)</>}
          , the skill itself, an Element of the Soul and a Lesson. Every card must carry{' '}
          <span className="chips">{plan.principles.map((p) => <P key={p} id={p} />)}</span>{plan.principles.length > 1 && ' (either will do)'}; its strength does not matter.{' '}
          {plan.need > 0 && <><Status kind={plan.ready >= plan.need ? 'ready' : 'items'}>{Math.min(plan.ready, plan.need)} of {plan.need} memories to hand today</Status>
            {plan.ready > plan.need && <span className="muted small"> ({plan.ready} to choose from)</span>}</>}</p>
        <p className="small">Element of the Soul: {plan.souls.length
          ? <>{[...new Set(plan.souls.map((c) => c.name))].join(', ')} will do.</>
          : <span className="warn">none of the cards you hold carries {either}.</span>}
          {' '}<span className="muted">Lessons are not tracked here.</span></p>
        <div className="row filters">
          <span>Current season</span>
          <SeasonPicker value={season} seasons={ALL_SEASONS} onChange={(v) => player.setSetting('season', v)} />
          <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> also show memories out of reach ({plan.rows.length - plan.rows.filter((r) => r.state !== 'locked').length})</label>
        </div>
        {shown.length > 0 && <table className="memories">
          <thead><tr><th>Memory that fits</th><th className="num" title="How many you are certain to get today">Today</th><th>Where it comes from</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.item.id}>
              <td><span className="withicon"><ItemIcon item={r.item} size={24} /><a href={`#/db/memories/${r.item.id}`}><b>{r.item.name}</b></a></span>
                <div className="small"><PList map={r.item.principles} short /></div></td>
              <td className="num">{r.ready ? <b>{r.ready}</b> : <span className="muted">–</span>}</td>
              <td>{r.sources.length ? <Sources sources={r.sources} />
                : r.ready ? <span className="muted small">ticked as held</span>
                : <span className="muted small">{r.item.sources.length ? `No source worked out. The wiki mentions: ${r.item.sources.join(', ')}.` : 'The wiki records no source.'}</span>}</td>
            </tr>))}</tbody>
        </table>}
        {!shown.length && <p className="muted">No fitting memory is within reach yet. Tick the box above to see every one that fits.</p>}
        <p className="footnote">"Today" counts each painting, book or other thing once, the sea once per place and a recipe once; foraging that depends on the draw is not counted.
          {!season && ' Choose the season to count the sea and to see what the foraging places yield now.'}</p>
      </>}
    </div>
  );
}

function Items({ data, q, p, focus }: Props) {
  const player = usePlayer();
  const [aspect, setAspect] = useState('');
  const [open, setOpen] = useState<string | null>(focus);
  const [n, setN] = useState(PAGE);
  const aspects = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of data.items) if (!isMemory(i)) for (const a of i.aspects) c.set(a, (c.get(a) ?? 0) + 1);
    return [...c.entries()].filter(([, k]) => k >= 4).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);
  useFocus(focus, setOpen);
  const rows = focusFirst(data.items.filter((i) => !isMemory(i) && (!p || (i.principles[p] ?? 0) > 0) && (!aspect || i.aspects.includes(aspect)) && match(i.name, q))
    .sort((a, b) => (p ? (b.principles[p] ?? 0) - (a.principles[p] ?? 0) : 0) || a.name.localeCompare(b.name)), data.items, focus);
  return (
    <>
      <div className="row filters">
        <label>Aspect <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="">any</option>{aspects.map(([a, k]) => <option key={a} value={a}>{a} ({k})</option>)}</select></label>
        <span className="muted small">Memories have <a href="#/db/memories">a tab of their own</a>.</span>
      </div>
      <More shown={n} total={rows.length} onMore={() => setN(n + PAGE)} />
      <TableWrap label="Items"><table>
        <thead><tr><th>Owned</th><th>Item</th><th>Principles</th><th>Aspects</th><th>Gives memory</th></tr></thead>
        <tbody>{rows.slice(0, n).map((i) => [
          <tr key={i.id} id={`row-${i.id}`} className={open === i.id ? 'open' : ''}>
            <td><input type="checkbox" checked={!!player.itemsOwned[i.id]} onChange={() => player.toggle('itemsOwned', i.id)} aria-label={`Owned: ${i.name}`} /></td>
            <td><span className="withicon"><ItemIcon item={i} size={30} /><button className="link name" onClick={() => setOpen(open === i.id ? null : i.id)}>{i.name}</button></span></td>
            <td><PList map={i.principles} short /></td>
            <td className="small">{i.aspects.filter((a) => a !== 'Thing').join(', ')}</td>
            <td><MemoryLink data={data} name={i.yieldsMemory} /></td>
          </tr>,
          open === i.id && <tr key={i.id + ':d'} className="detail"><td colSpan={5}><Lore text={i.description} /><ItemDetail data={data} i={i} /></td></tr>,
        ])}</tbody>
      </table></TableWrap>
    </>
  );
}

function ItemDetail({ data, i }: { data: GameData; i: Item }) {
  const made = data.recipes.filter((r) => r.result === i.id);
  const used = data.recipes.filter((r) => r.ingredient?.item === i.id || (r.ingredient?.aspect && i.aspects.includes(r.ingredient.aspect)));
  return (
    <div className="cols">
      <div><h4>Where it comes from</h4>{i.sources.length ? <p>{i.sources.join(' · ')}</p> : <p className="muted">Not recorded on the wiki.</p>}
        {made.length > 0 && <ul>{made.map((r) => <li key={r.id}>Crafted: <a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.tier} <P id={r.principle} short /></a></li>)}</ul>}</div>
      <div><h4>Used as an ingredient in</h4>
        {used.length ? <ul>{used.slice(0, 12).map((r) => <li key={r.id}><a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName}</a> <span className="muted">({r.tier})</span></li>)}</ul> : <p className="muted">No recipe.</p>}</div>
    </div>
  );
}

function Stations({ data, q, p, focus }: Props) {
  const player = usePlayer();
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<string | null>(focus);
  const kinds = useMemo(() => [...new Set(data.workstations.map((w) => w.kind))].sort(), [data]);
  useFocus(focus, setOpen);
  const rows = focusFirst(data.workstations.filter((w) => (!p || w.principles.includes(p)) && (!kind || w.kind === kind) && match(w.name, q)), data.workstations, focus);
  return (
    <>
      <div className="row filters">
        <label>Kind <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">any</option>{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
        {player.settings.assumeAllStationsUnlocked ? <span className="muted">All workstations are treated as unlocked (change in Settings).</span>
          : <span className="muted">A workstation is unlocked when its room is ticked on the <a href="#/house">Hush House</a> page, or ticked here.</span>}
      </div>
      <p className="muted count">{rows.length} of {data.workstations.length} shown</p>
      <TableWrap label="Workstations"><table>
        <thead><tr><th>Unlocked</th><th>Workstation</th><th>Kind</th><th>Principles</th><th>Extra slots accept</th><th>Evolve via</th></tr></thead>
        <tbody>{rows.map((w) => [
          <tr key={w.id} id={`row-${w.id}`} className={open === w.id ? 'open' : ''}>
            <td><input type="checkbox" disabled={player.settings.assumeAllStationsUnlocked}
              checked={stationUnlocked(data, player, w)}
              onChange={() => player.toggle('stationsUnlocked', w.id)} aria-label={`Unlocked: ${w.name}`} /></td>
            <td><button className="link name" onClick={() => setOpen(open === w.id ? null : w.id)}>{w.name}</button><div className="small muted">{w.room}</div></td>
            <td>{w.kind}</td>
            <td><span className="chips">{w.principles.map((x) => <P key={x} id={x} short />)}</span></td>
            <td className="small">{w.slots.map((s, i) => <div key={i}>{s.join(', ')}</div>)}</td>
            <td>{w.evolveVia.map((x) => wisdom(x).name).join(', ') || '—'}</td>
          </tr>,
          open === w.id && <tr key={w.id + ':d'} className="detail"><td colSpan={6}><Lore text={w.description} /><StationDetail data={data} w={w} /></td></tr>,
        ])}</tbody>
      </table></TableWrap>
    </>
  );
}

/** Things opened for one of several things. Reference only: they do not enter "what I have" or any calculation. */
function Caches({ data, q, p, focus }: Props) {
  const rows = data.caches.filter((c) => (!p || (c.principles[p] ?? 0) > 0)
    && (match(c.name, q) || c.drops.some((d) => match(d.name, q)) || c.sources.some((s) => match(s.name, q))));
  // a link from another cache or from Foraging names the row to show
  useEffect(() => { if (focus) document.getElementById(`cache-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus]);
  return (
    <>
      <p className="muted">Caches are opened with Consider and turn into one of the things listed, at the chance shown. Search also matches what is inside and where a cache is found.</p>
      <p className="muted count">{rows.length} of {data.caches.length} shown</p>
      <TableWrap label="Caches"><table className="forage">
        <thead><tr><th>Cache</th><th>Found</th><th>Opens into one of</th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id} id={`cache-${c.id}`} className={focus === c.id ? 'open' : ''}>
            <td><span className="withicon"><ItemIcon item={c} size={30} /><b className="name">{c.name}</b></span>
              <div className="small"><PList map={c.principles} short /></div><Lore text={c.description} /></td>
            <td className="small">{c.sources.map((s) => <div key={s.name}>{s.repeatable ? <b>{s.name}</b> : s.name}{s.repeatable && <span className="muted"> (repeatable)</span>}</div>)}
              {!c.sources.length && <span className="muted">not recorded on the wiki</span>}</td>
            <td>{c.alsoGives && <p className="small">Always gives <b>{c.alsoGives}</b>, and one of:</p>}
              <p className="wrap">{c.drops.map((d) => {
                const href = d.cache ? `#/db/caches/${d.cache}` : d.item ? (data.itemById[d.item] ? itemHref(data.itemById[d.item]) : `#/db/items/${d.item}`) : null;
                const label = <>{d.name}{d.chance != null && <span className="muted"> {d.chance}%</span>}</>;
                return href ? <a key={d.name} className="pill" href={href}>{label}</a> : <span key={d.name} className="pill">{label}</span>;
              })}</p>
              {c.sharedWith.length > 0 && <p className="small muted">Shares its deck with {c.sharedWith.join(', ')}: the same thing never comes twice from these.</p>}</td>
          </tr>))}</tbody>
      </table></TableWrap>
    </>
  );
}

function StationDetail({ data, w }: { data: GameData; w: Workstation }) {
  const recipes = data.recipes.filter((r) => stationQualifies(r, w, data));
  if (!w.canCraft) return <p className="muted">This place is not used for crafting.</p>;
  return (<><h4>Recipes it can host ({recipes.length})</h4>
    <p className="wrap">{recipes.map((r) => <a key={r.id} className="pill" href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName} <span className="muted">{r.tier}</span></a>)}</p></>);
}
