import { useState } from 'react';
import { ItemIcon, P, Panel, SeasonPicker, Soul, Status, TableWrap } from '../components/ui';
import { ALL_SEASONS } from '../engine/constants';
import { forageRows, type ForageRow } from '../engine/engine';
import type { ForageDrop, GameData } from '../engine/types';
import { usePlayer } from '../store';

export function Foraging({ data }: { data: GameData }) {
  const player = usePlayer();
  const [only, setOnly] = useState(false);
  const season = ALL_SEASONS.includes(player.settings.season) ? player.settings.season : '';
  const all = forageRows(data, player, season);
  const rows = all.filter((r) => !only || r.available);
  return (
    <Panel title="Foraging" actions={
      <label className="check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> places I can reach only</label>}>
      <p className="muted">Places where an Element of the Soul, usually with a Skill, brings something back instead of crafting a recipe, and the sea, which gives memories.
        What comes back depends on the season; the strength of the cards makes no difference. Each place draws from a deck that is
        only reshuffled when empty, so the chances are for a full deck. Most places cannot be used at night.</p>
      <div className="row filters">
        <span>Current season</span>
        <SeasonPicker value={season} seasons={ALL_SEASONS} onChange={(s) => player.setSetting('season', s)} />
        <span className="muted small">{season ? 'Click the season again to compare all five.' : 'No season chosen: every season is shown.'} Shared with the Hush House page.</span>
      </div>
      <p className="muted count">{all.filter((r) => r.available).length} of {all.length} places reachable{season && <> · {all.filter((r) => r.ready && r.drops.length).length} you can forage this {season === 'Numa' ? 'Numa' : season.toLowerCase()}</>}</p>
      <TableWrap label="Foraging places"><table className="forage">
        <thead><tr><th>Place</th><th>Can I go?</th><th>Element of the Soul</th><th>Skill</th><th>{season ? `Yields in ${season}` : 'Yields by season'}</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.spot.id}>
            <td><b className="name">{r.spot.name}</b>{r.spot.count > 1 && <span className="tag">×{r.spot.count}</span>}
              <div className="small muted">{r.spot.place}</div>
              {r.spot.note && <div className="small muted"><i>{r.spot.note}</i></div>}
              {r.spot.principles.length > 0 && <div className="small"><span className="chips">{r.spot.principles.map((p) => <P key={p} id={p} short />)}</span></div>}</td>
            <td>{availability(r)}</td>
            <td>{!r.elements.length && <span className="muted">none needed</span>}{r.spot.needs && <div>give a {r.spot.needs}</div>}{r.elements.map((e) => <div key={e.id} className={e.held ? '' : 'muted'}><Soul id={e.id} />{!e.held && <span className="small"> (none held)</span>}</div>)}</td>
            <td>{!r.needsSkill ? <span className="muted">none needed</span> : <>
              <div className="small"><span className="muted">any Skill with </span><span className="chips">{r.spot.skillPrinciples.map((p) => <P key={p} id={p} short />)}</span></div>
              {r.skills.filter((s) => s.level > 0).map((s) => <div key={s.skill.id}>{s.skill.name} <span className="muted small">level {s.level}</span></div>)}
              {!r.skills.some((s) => s.level > 0) && <div className="warn small">you have none of them yet</div>}
              <details><summary className="small muted">all {r.skills.length} that fit</summary>
                <div className="small">{r.skills.map((s) => s.skill.name).join(', ')}</div></details></>}</td>
            <td>{season ? <Yields data={data} drops={r.drops} season={season} /> : <AllSeasons data={data} drops={r.drops} />}</td>
          </tr>))}</tbody>
      </table></TableWrap>
      {!rows.length && <p className="muted">Nothing matches.</p>}
    </Panel>
  );
}

function availability(r: ForageRow) {
  if (!r.available) return <><Status kind="blocked">Locked</Status><div className="small muted">unlock {r.room?.name} on the <a href="#/house">Hush House</a> page</div></>;
  if (!r.ready) return <><Status kind="items">Reachable</Status><div className="small muted">{r.elements.some((e) => e.held) ? 'no fitting Skill yet' : 'no fitting Element held'}</div></>;
  return <><Status kind="ready">Yes</Status>{!r.room && <div className="small muted">open from the start</div>}</>;
}

function Name({ data, drop }: { data: GameData; drop: ForageDrop }) {
  const item = drop.item ? data.itemById[drop.item] : null;
  if (drop.cache) return <span className="withicon"><ItemIcon item={data.caches.find((c) => c.id === drop.cache)} size={22} /><a href={`#/db/caches/${drop.cache}`} title="A cache: open it for one of several things">{drop.name}</a></span>;
  return <span className="withicon"><ItemIcon item={item} size={22} />{item ? <a href={`#/db/items/${item.id}`}>{drop.name}</a> : drop.name}</span>;
}

function Yields({ data, drops, season }: { data: GameData; drops: ForageDrop[]; season: string }) {
  if (!drops.length) return <span className="muted">nothing in this season</span>;
  return <ul className="picks">{drops.map((d) => <li key={d.name}><Name data={data} drop={d} /> {d.chance[season]! < 100 && <b>{d.chance[season]}%</b>}{d.with && <span className="muted small"> if I add a {d.with}</span>}</li>)}</ul>;
}

function AllSeasons({ data, drops }: { data: GameData; drops: ForageDrop[] }) {
  return (
    <table className="deck">
      <thead><tr><th></th>{ALL_SEASONS.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
      <tbody>{drops.map((d) => <tr key={d.name}><td><Name data={data} drop={d} />{d.with && <span className="muted small"> with a {d.with}</span>}</td>
        {ALL_SEASONS.map((s) => <td key={s} className="num">{d.chance[s] == null ? <span className="muted">–</span> : d.chance[s]! < 100 ? `${d.chance[s]}%` : 'yes'}</td>)}</tr>)}</tbody>
    </table>);
}
