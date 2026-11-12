import { useMemo, useState } from 'react';
import { Icon, Lore, P, Panel, PList, Status, TableWrap } from '../components/ui';
import { ALL_SEASONS, PRINCIPLE_IDS } from '../engine/constants';
import { HELPER_CATEGORIES, helperBest, helperPool, helpersIn, prerequisiteMet, roomStatuses, trimPlan, type RoomState, type RoomStatus } from '../engine/engine';
import type { Assistant, GameData, PrincipleId, Room } from '../engine/types';
import { useCtx, usePlayer } from '../store';

const STATE_LABEL: Record<RoomState, string> = { unlocked: 'Unlocked', openable: 'Can open now', short: 'Not yet', special: 'Special requirement', beyond: 'Behind a locked room' };
const STATE_KIND: Record<RoomState, 'ready' | 'items' | 'blocked'> = { unlocked: 'ready', openable: 'items', short: 'blocked', special: 'blocked', beyond: 'blocked' };
const ORDER: RoomState[] = ['openable', 'short', 'special', 'beyond', 'unlocked'];

export function House({ data }: { data: GameData }) {
  const player = usePlayer();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'next' | 'all' | 'unlocked'>('next');
  const [helperId, setHelperId] = useState(data.assistants[0]?.id ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const season = player.settings.season;
  const ctx = useCtx(data);
  const helpers = useMemo(() => helpersIn(data, season), [data, season]);
  const statuses = roomStatuses(ctx, helpers);
  const pool = helperPool(ctx);
  const helper = data.assistants.find((a) => a.id === helperId) ?? data.assistants[0];
  const done = statuses.filter((s) => s.state === 'unlocked').length;
  const openable = statuses.filter((s) => s.state === 'openable').length;
  const rows = statuses.filter((s) => {
    if (show === 'next' && !['openable', 'short', 'special'].includes(s.state)) return false;
    if (show === 'unlocked' && s.state !== 'unlocked') return false;
    const t = q.trim().toLowerCase();
    return !t || s.room.name.toLowerCase().includes(t) || (s.room.lockedName ?? '').toLowerCase().includes(t);
  }).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.missing - b.missing || a.need - b.need || a.room.name.localeCompare(b.room.name));

  return (
    <>
      <Panel title="Hush House" actions={<input className="search" type="search" placeholder="Search rooms…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rooms" />}>
        <div className="progress" role="img" aria-label={`${done} of ${data.rooms.length} rooms unlocked`}><span style={{ width: `${(done / data.rooms.length) * 100}%` }} /></div>
        <p><b>{done}</b> of {data.rooms.length} places unlocked · <b>{openable}</b> you can open now with a helper and what you have.</p>
        <div className="row filters">
          <label>Show <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="next">rooms I can reach next</option><option value="all">all rooms</option><option value="unlocked">unlocked rooms</option></select></label>
          <label>Season <select value={season} onChange={(e) => player.setSetting('season', e.target.value)}>
            <option value="">any (all seasonal workers)</option>{ALL_SEASONS.map((s) => <option key={s}>{s === 'Numa' ? 'Numa (no helpers)' : s}</option>)}</select></label>
        </div>
        {season === 'Numa' && <p className="warn">During Numa no helper can be hired: the Rectory, the Smithy and the Killes' house are closed, so rooms that need Assistance have to wait.
          The Sweet Bones offers uncanny labours for Tally instead, and <a href="#/foraging">foraging</a> yields things found in no other season.</p>}
        <TableWrap label="Rooms"><table>
          <thead><tr><th>Unlocked</th><th>Room</th><th>Needs</th><th>Status</th><th>Best helper and boosts</th></tr></thead>
          <tbody>{rows.map((s) => [
            <tr key={s.room.id} className={open === s.room.id ? 'open' : ''}>
              <td><input type="checkbox" checked={!!player.roomsUnlocked[s.room.id]} onChange={() => player.toggle('roomsUnlocked', s.room.id)} aria-label={`Unlocked: ${s.room.name}`} /></td>
              <td><button className="link name" onClick={() => setOpen(open === s.room.id ? null : s.room.id)}>{s.room.name}</button>
                {s.room.lockedName && s.room.lockedName !== s.room.name && <div className="small muted">locked: {s.room.lockedName}</div>}</td>
              <td>{opener(s.room) && <div className="small muted">{opener(s.room)}</div>}
                {Object.keys(s.room.requires).length ? <span className="chips">{(Object.entries(s.room.requires) as [PrincipleId, number][]).map(([p, n], i) => <span key={p}>{i > 0 && <span className="muted small"> or </span>}<P id={p} value={n} short /></span>)}</span>
                : !opener(s.room) && <span className="small">—</span>}
                {Object.keys(s.room.requiresAlso).length > 0 && <div className="small"><span className="muted">and </span><PList map={s.room.requiresAlso} short /></div>}</td>
              <td><Status kind={STATE_KIND[s.state]}>{STATE_LABEL[s.state]}</Status></td>
              <td className="small">{describe(s)}</td>
            </tr>,
            open === s.room.id && <tr key={s.room.id + ':d'} className="detail"><td colSpan={5}><RoomDetail data={data} s={s} /></td></tr>,
          ])}</tbody>
        </table></TableWrap>
        {!rows.length && <p className="muted">Nothing matches.</p>}
      </Panel>

      <Panel title="Helpers" actions={
        <label>Helper <select value={helper.id} onChange={(e) => setHelperId(e.target.value)}>
          {data.assistants.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind}{a.season ? `, ${a.season}` : ''})</option>)}</select></label>}>
        <p className="muted">How far each helper can be raised today. Talking to a helper with a card adds that card's Principles for the day.
          Boosts of different kinds add up, one card of each kind:
          {' '}{HELPER_CATEGORIES.map((c) => (c === 'Soul' ? 'an Element of the Soul' : c.toLowerCase())).join(', ')}, plus the one material unique to some helpers.
          Cards counted are what you have and what you can craft right now.</p>
        <HelperTable data={data} helper={helper} best={(a, p) => helperBest(ctx, pool, a, p)} />
      </Panel>
    </>
  );
}

/** How a room is opened when it is not a helper's job; null for ordinary Assistance. */
function opener(r: Room): string | null {
  if (r.opener === 'Assistance') return null;
  if (r.opener === 'Item') return r.openerName ?? 'a special thing';
  if (r.opener === 'Circumstance') return `the Circumstance ${r.openerName ?? ''} with`.replace('  ', ' ');
  return `one ${r.opener} card${r.openerForbids ? ` (not ${r.openerForbids})` : ''} with`;
}

function describe(s: RoomStatus) {
  if (s.state === 'unlocked') return <span className="muted">—</span>;
  if (s.card) return s.card.card
    ? <><b>{s.card.card.name}</b> <P id={s.card.principle} value={s.card.value} short />{s.card.card.via && <span className="muted"> ({s.card.card.via})</span>}
      {s.missing > 0 && <span className="warn"> · {s.missing} short</span>}</>
    : <span className="muted">no fitting {s.room.opener} card among what you have; a helper cannot open this</span>;
  if (!s.plan) return <span className="muted">{s.room.opener === 'Assistance' ? (Object.keys(s.room.requires).length ? 'no helper can be hired this season' : 'no Principle requirement recorded') : `needs ${opener(s.room)!.replace(/ with$/, '')}; a helper cannot open this`}</span>;
  const boosts = trimPlan(s.plan, s.need);
  return (<><b>{s.plan.assistant.name}</b> <P id={s.plan.principle} value={s.plan.base} short />
    {boosts.map((k, i) => <span key={i}> + {k.card!.name} <b>+{k.value}</b></span>)}
    {s.missing > 0 ? <span className="warn"> · {s.missing} short of {s.need}</span> : <span className="muted"> = {Math.min(s.plan.total, s.plan.base + boosts.reduce((a, b) => a + b.value, 0))} of {s.need}</span>}</>);
}

function RoomDetail({ data, s }: { data: GameData; s: RoomStatus }) {
  const player = usePlayer();
  const r = s.room;
  const names = (ids: string[]) => ids.map((id) => data.roomById[id]?.name ?? id);
  return (
    <div className="cols">
      <div><h4>Access</h4>
        <Lore text={r.description} />
        <p>{r.era ? `${r.era} period. ` : ''}{r.openedFrom.length ? <>Reached from {names(r.openedFrom).map((n, i) => <span key={n}>{i > 0 && ', '}<b className={player.roomsUnlocked[r.openedFrom[i]] ? '' : 'muted'}>{n}</b></span>)}.</> : 'No prerequisite room recorded on the wiki.'}
          {!prerequisiteMet(player, r) && <span className="warn"> None of those is unlocked yet.</span>}</p>
        {r.exposes.length > 0 && <p>Opening it reveals {names(r.exposes).join(', ')}.</p>}
        {r.workstations.length > 0 && <p>Workstations: {r.workstations.map((w) => data.stationById[w]?.name ?? w).join(', ')}.</p>}</div>
      <div><h4>Found inside ({r.contents.length})</h4>
        {r.contents.length ? <p className="wrap">{r.contents.map((id) => <a key={id} className="pill" href={`#/db/items/${id}`}>{data.itemById[id]?.name ?? id}</a>)}</p> : <p className="muted">Nothing the database tracks.</p>}</div>
      {s.plan && s.state !== 'unlocked' && <div><h4>Best attempt: {s.plan.assistant.name}, {s.plan.total} of {s.need}</h4>
        <ul className="picks"><li><span className="slot">Helper</span> {s.plan.assistant.name} <b>+{s.plan.base}</b></li>
          {s.plan.picks.map((k, i) => <li key={i}><span className="slot">{k.slot}</span> {k.card ? <>{k.card.name} <b>+{k.value}</b>{k.card.via && <span className="muted small"> ({k.card.via})</span>}</> : <span className="muted">nothing useful</span>}</li>)}</ul></div>}
    </div>);
}

function HelperTable({ data, helper, best }: { data: GameData; helper: Assistant; best: (a: Assistant, p: PrincipleId) => ReturnType<typeof helperBest> }) {
  const [sel, setSel] = useState<PrincipleId | null>(null);
  const plans = PRINCIPLE_IDS.map((p) => best(helper, p));
  const detail = plans.find((x) => x.principle === sel);
  return (
    <>
      <p><span className="withicon"><Icon group="person" id={helper.id} size={40} square /><span><b>{helper.name}</b> · {helper.kind}{helper.season ? ` (${helper.season})` : ''} · {helper.fee}p
        {helper.hire && <> · hire with {helper.hire}</>}<br /><PList map={helper.principles} />{helper.unique && <span className="small"> · also accepts <b>{helper.unique}</b></span>}</span></span></p>
      <TableWrap label="Helper boosts by Principle"><table>
        <thead><tr><th>Principle</th><th className="num">Alone</th><th className="num">Boosted today</th><th>Boosts</th></tr></thead>
        <tbody>{plans.map((pl) => (
          <tr key={pl.principle} className={sel === pl.principle ? 'open' : ''}>
            <td><button className="link" onClick={() => setSel(sel === pl.principle ? null : pl.principle)}><P id={pl.principle} /></button></td>
            <td className="num">{pl.base}</td><td className="num"><b>{pl.total}</b></td>
            <td className="small">{pl.picks.filter((k) => k.card).map((k) => `${k.card!.name} +${k.value}`).join(', ') || <span className="muted">nothing you have helps</span>}</td>
          </tr>))}</tbody>
      </table></TableWrap>
      {detail && <div className="detail-box"><h3>{helper.name}: <P id={detail.principle} value={detail.total} /></h3>
        <ul className="picks"><li><span className="slot">Helper</span> {helper.name} <b>+{detail.base}</b></li>
          {detail.picks.map((k, i) => <li key={i}><span className="slot">{k.slot}</span> {k.card ? <>{k.card.name} <b>+{k.value}</b>{k.card.via && <span className="muted small"> ({k.card.via})</span>}</> : <span className="muted">nothing useful</span>}</li>)}</ul>
        <p className="small muted">Rooms this would open: {data.rooms.filter((r) => r.needsAssistance && (r.requires[detail.principle] ?? 99) <= detail.total).length} of {data.rooms.filter((r) => r.needsAssistance && r.requires[detail.principle]).length} that accept this Principle.</p></div>}
    </>);
}
