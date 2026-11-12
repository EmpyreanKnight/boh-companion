import { useMemo, useState } from 'react';
import { ItemIcon, P, Panel, PList, PrincipleFilter, SkillIcon, Soul, Status, Stepper, TableWrap } from '../components/ui';
import { ELEMENTS, LEVEL_SUFFIX, OPPORTUNITIES } from '../engine/constants';
import { BANDS, craftList, readingTable, skillPrinciples, type CraftRow, type Solution } from '../engine/engine';
import type { GameData, PrincipleId } from '../engine/types';
import { useCtx, usePlayer } from '../store';

export function Tracker({ data }: { data: GameData }) {
  const player = usePlayer();
  const [p, setP] = useState<PrincipleId | ''>('');
  const [sel, setSel] = useState<PrincipleId | null>(null);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const ctx = useCtx(data);
  const rows = readingTable(ctx);
  const skills = data.skills.filter((s) => (!p || s.primary === p || s.secondary === p) && (!onlyOwned || player.skills[s.id]));
  const detail = rows.find((r) => r.principle === sel);
  const weathers = useMemo(() => data.items.filter((i) => i.aspects.includes('Weather')), [data]);
  // tools and inks nobody crafts are found in the house or bought; everything with a recipe is listed under crafting
  const tools = useMemo(() => data.items.filter((i) => (i.aspects.includes('Tool') || i.aspects.includes('Ink')) && !data.recipes.some((r) => r.result === i.id))
    .sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const crafts = craftList(ctx);
  const craftable = crafts.filter((c) => c.state === 'craftable');
  const held = crafts.filter((c) => c.state === 'have');
  const blocked = crafts.filter((c) => c.state === 'blocked');
  const memories = ctx.items.filter((c) => c.have && c.aspects.includes('Memory'));
  // nothing left that is certain to succeed: point at the game's random help
  const stuck = rows.every((r) => r.unlocked.have.length === 0) && rows.some((r) => r.near.length > 0);
  const opportunity = <>If you attempt a book while a little short, the game may offer an Opportunity: one more card whose Principles are added.
    The wiki gives the chance of it being {OPPORTUNITIES.map((o, i) => `${i === OPPORTUNITIES.length - 1 ? 'or ' : ''}${o.kind} as ${o.chance}%`).join(', ')}.
    It is luck, so the numbers above do not count it; a book only a point or two away is worth a try.</>;
  const weather = (
    <label>Today's weather{' '}
      <select value={player.settings.weather} onChange={(e) => player.setSetting('weather', e.target.value)}>
        <option value="">not counted</option>
        {weathers.map((w) => <option key={w.id} value={w.id}>{w.name} ({Object.entries(w.principles).map(([k, v]) => `${k} ${v}`).join(', ')})</option>)}
      </select></label>);
  const craftRow = (c: CraftRow) => (
    <li key={c.item.id} className={`toolchip ${c.state !== 'blocked' ? 'on' : ''}`}>
      <input type="checkbox" checked={!!player.itemsOwned[c.item.id]} onChange={() => player.toggle('itemsOwned', c.item.id)}
        title="I already hold one" aria-label={`I already hold ${c.item.name}`} />
      <ItemIcon item={c.item} size={22} />
      <span><a href={`#/crafting/${encodeURIComponent(c.recipe.id)}`}>{c.item.name}</a>
        <span className="muted small"> {c.state === 'blocked' ? c.gap : c.via}</span></span>
      <PList map={c.item.principles} short />
    </li>);
  return (
    <>
      <Panel title="How high can I read?" actions={weather}>
        <p className="muted">The highest Mystery you can master per Principle, at the best desk (or with Consider). A random Opportunity can add more when you fall short, so these are guaranteed minimums.</p>
        <ul className="legend">{BANDS.map((b) => <li key={b.id}><b>{b.name}.</b> {b.hint}</li>)}</ul>
        <TableWrap label="Reading by Principle"><table className="reading">
          <thead><tr><th>Principle</th>{BANDS.map((b) => <th key={b.id} className="num" title={b.hint}>{b.name}</th>)}
            <th className="num" title="Unread books within reach: soul & skill · with what I have · game maximum">Unread books in reach</th><th>How, with what I have</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.principle} className={sel === r.principle ? 'open' : ''}>
              <td><button className="link" onClick={() => setSel(sel === r.principle ? null : r.principle)}><P id={r.principle} /></button></td>
              {BANDS.map((b) => <td key={b.id} className="num"><b>{r.bands[b.id].total}</b></td>)}
              <td className="num">{r.unlocked.self.length} · <b>{r.unlocked.have.length}</b> · {r.unlocked.max.length}</td>
              <td className="small">{describe(r.bands.have)}</td>
            </tr>))}</tbody>
        </table></TableWrap>
        <p className="muted small">Unread counts are soul &amp; skill · with what I have · game maximum. Click a Principle for the books.</p>
        {stuck && <p className="footnote">No unread book is within guaranteed reach right now, but falling short is not final. {opportunity}</p>}
        {detail && (
          <div className="detail-box">
            <h3><P id={detail.principle} /> at {detail.bands.have.station?.name ?? '—'}</h3>
            <div className="cols">
              {BANDS.map((b) => (
                <div key={b.id}><h4>{b.name}: {detail.bands[b.id].total}</h4>
                  <ul className="picks">{detail.bands[b.id].picks.map((k, i) => <li key={i}><span className="slot">{k.slot}</span> {k.card ? <>{k.card.name} <b>+{k.value}</b>{k.card.via && <span className="muted small"> ({k.card.via})</span>}</> : <span className="muted">empty</span>}</li>)}</ul>
                  <p className="small muted">at {detail.bands[b.id].station?.name}</p></div>))}
            </div>
            <h4>Unread books you can master with what you have ({detail.unlocked.have.length})</h4>
            <p className="wrap">{[...detail.unlocked.have].sort((a, b) => b.mystery - a.mystery).map((b) => <a key={b.id} className="pill" href={`#/db/books/${b.id}`}>{b.name} <b>{b.mystery}</b></a>)}
              {!detail.unlocked.have.length && <span className="muted">None yet.</span>}</p>
            <h4>Next step</h4>
            {detail.near.length ? <ul>{detail.near.slice(0, 8).map((x) => (
              <li key={x.book.id}><a href={`#/db/books/${x.book.id}`}>{x.book.name}</a> (Mystery {x.book.mystery}): {x.missing > 0 && <>needs {x.missing} more</>}
                {x.missing > 0 && x.needsLanguage && ' and '}{x.needsLanguage && <>needs the language {x.book.languageName}</>}</li>))}</ul>
              : <p className="muted">No unread book within 3 points.</p>}
            {detail.unlocked.have.length === 0 && detail.near.some((x) => x.missing > 0) && <p className="footnote">{opportunity}</p>}
          </div>)}
      </Panel>

      <Panel title={`Skills (${Object.keys(player.skills).length} owned)`} actions={
        <label className="check"><input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> owned only</label>}>
        <PrincipleFilter value={p} onChange={setP} />
        <div className="skill-grid">
          {skills.map((s) => {
            const lvl = player.skills[s.id] ?? 0;
            return (
              <div key={s.id} className={`skill-card ${lvl ? 'owned' : ''}`}>
                <div className="skill-name"><SkillIcon skill={s} size={30} /><span>{player.settings.hideUnfound && !lvl ? 'Unfound skill' : s.name}{s.isLanguage && <span className="tag">Language</span>}</span></div>
                <div>{lvl ? <PList map={skillPrinciples(s, lvl)} short /> : <span className="chips"><P id={s.primary} short /><P id={s.secondary} short /></span>}</div>
                <Stepper value={lvl} onChange={(n) => player.setSkill(s.id, n)} label={`${s.name} level`} />
              </div>);
          })}
        </div>
      </Panel>

      <Panel title="What I have">
        <p className="muted">Worked out from your progress: these feed the "With what I have" column above, the recipe planner and the helpers on the Hush House page.</p>
        <div className="row">
          <label className="check"><input type="checkbox" checked={player.settings.countRoomContents} onChange={(e) => player.setSetting('countRoomContents', e.target.checked)} />
            count things lying in rooms I have unlocked (<a href="#/house">Hush House</a>)</label>
        </div>
        <h4>Tools and inks in the house</h4>
        <p className="small muted">Ticked for you when they lie in a room you have unlocked. Tick anything else you hold here, or in <a href="#/db/items">Database → Items</a>.</p>
        <div className="toolgrid">{tools.map((t) => {
          const via = ctx.have.get(t.id);
          const auto = !!via && !player.itemsOwned[t.id];
          return (
            <label key={t.id} className={`toolchip ${via ? 'on' : ''}`} title={auto ? via : undefined}>
              <input type="checkbox" checked={!!via} disabled={auto} onChange={() => player.toggle('itemsOwned', t.id)} />
              <ItemIcon item={t} size={22} /><span>{t.name}</span><PList map={t.principles} short />
            </label>);
        })}</div>
        <h4>Things I can craft <Status kind="ready">{craftable.length} now</Status> <Status kind="items">{held.length} held</Status> <Status kind="blocked">{blocked.length} not yet</Status></h4>
        <p className="small muted">Followed from the recipes: anything your skills, soul cards, unlocked workstations and the things above can make today counts as something you have. Tick a box if you already hold one.</p>
        {craftable.length ? <ul className="toolgrid craftgrid">{craftable.map(craftRow)}</ul> : <p className="muted">Nothing yet. Raise a skill or unlock a workstation.</p>}
        {held.length > 0 && <details><summary>Already held ({held.length})</summary><ul className="toolgrid craftgrid">{held.map(craftRow)}</ul></details>}
        {blocked.length > 0 && <details><summary>Not yet craftable ({blocked.length}), with what is missing</summary><ul className="toolgrid craftgrid">{blocked.map(craftRow)}</ul></details>}
        <h4>Memories I can call up today ({memories.length})</h4>
        {memories.length ? <ul className="memlist">{memories.map((m) => <li key={m.id}><ItemIcon item={data.itemById[m.id]} size={20} /> <b>{m.name}</b> <PList map={m.principles} short /> <span className="muted small">{m.via}</span></li>)}</ul>
          : <p className="muted">None yet. Pick the weather, tick mastered books (re-reading one gives its memory), unlock rooms, or raise a skill that crafts one.</p>}
      </Panel>

      <Panel title="Elements of the Soul" actions={<>
        <button onClick={() => player.soulFromTree(data, false)} title="One base card per skill committed to the Tree, plus your starting cards">Derive from my Tree</button>
        <button onClick={() => player.soulFromTree(data, true)} title="As above, then evolved as far as the attuned skills allow">Derive, fully evolved</button></>}>
        <p className="muted">How many cards of each element you hold, by evolution level.</p>
        <TableWrap label="Elements of the Soul"><table className="soul-table">
          <thead><tr><th>Element</th>{LEVEL_SUFFIX.map((s, i) => <th key={i}>{s ? `${s} level` : 'Base'}</th>)}</tr></thead>
          <tbody>{ELEMENTS.map((e) => (
            <tr key={e.id}><td><Soul id={e.id} /><div className="small"><PList map={e.levels[0]} short /></div></td>
              {[0, 1, 2, 3].map((lvl) => <td key={lvl}><Stepper value={player.soul[e.id]?.[lvl] ?? 0} max={16} onChange={(n) => player.setSoul(e.id, lvl, n)} label={`${e.name}${LEVEL_SUFFIX[lvl]} cards`} />
                <div className="small"><PList map={e.levels[lvl]} short /></div></td>)}</tr>))}</tbody>
        </table></TableWrap>
      </Panel>
    </>
  );
}

function describe(s: Solution) {
  const used = s.picks.filter((k) => k.card);
  if (!used.length) return <span className="muted">nothing you have carries this Principle</span>;
  return <>{used.map((k) => `${k.card!.name} +${k.value}`).join(', ')} <span className="muted">at {s.station?.name}</span></>;
}
