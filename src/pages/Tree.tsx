import { useMemo, useState } from 'react';
import { iconUrl, P, Panel, SkillIcon, Soul } from '../components/ui';
import { ART_COLOR, element, LEVEL_SUFFIX, PRINCIPLE_IDS, TREE_LINKS, wisdom, WISDOMS } from '../engine/constants';
import { elementFor, emptyTree, filled, librarianOf, pickerRows, placement, reachable, startElements, stranded, treeIssues, treeStats } from '../engine/engine';
import { PRESET_SOURCE, PRESETS } from '../engine/presets';
import type { GameData, TreeState, WisdomId } from '../engine/types';
import { usePlayer } from '../store';

const R = (level: number) => 58 + level * 46;
const angle = (i: number) => (-90 + i * 40) * (Math.PI / 180);
const pos = (w: WisdomId, level: number) => {
  const a = angle(WISDOMS.findIndex((x) => x.id === w));
  return { x: Math.cos(a) * R(level), y: Math.sin(a) * R(level) };
};

export function Tree({ data }: { data: GameData }) {
  const player = usePlayer();
  const [sel, setSel] = useState<{ wisdom: WisdomId; level: number } | 'root' | null>(null);
  const lib = librarianOf(player);
  const start = useMemo(() => startElements(player), [player.settings.librarian, player.settings.librarianVariant]);
  const journal = player.journalCommitted ? lib.journal.element : null;
  const [evolveAll, setEvolveAll] = useState(true);
  const plan = player.settings.planMode;
  const tree = player.tree;
  const stats = useMemo(() => treeStats(data, tree, start, evolveAll, journal), [data, tree, start, evolveAll, journal]);
  const issues = useMemo(() => treeIssues(data, tree, plan ? undefined : player.skills, player.journalCommitted), [data, tree, plan, player.skills, player.journalCommitted]);
  const issueKeys = new Set(issues.map((i) => `${i.wisdom}:${i.level}`));

  const remove = (w: WisdomId, level: number) => {
    const next: TreeState = { ...tree, [w]: tree[w].map((id, i) => (i === level - 1 ? null : id)) };
    const lost = stranded(next);
    if (lost.length) {
      const names = lost.map((n) => `${wisdom(n.wisdom).name} ${n.level}`).join(', ');
      if (!confirm(`Removing this skill leaves ${lost.length} filled node(s) unreachable: ${names}.\n\nClear them too?`)) return;
      player.clearNodes([{ wisdom: w, level }, ...lost]);
    } else player.place(w, level, null);
  };
  const load = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (Object.keys(placement(tree)).length && !confirm(`Replace the current tree with "${preset.name}"?`)) return;
    player.setSetting('planMode', true);
    player.setJournal(true);      // every plan starts from the journal at the root
    player.setTree(preset.tree);
    setSel(null);
  };

  return (
    <div className="tree-layout">
      <Panel title="Tree of Wisdoms" actions={<>
        <label className="check" title="Ignore which skills you own and their levels"><input type="checkbox" checked={plan} onChange={(e) => player.setSetting('planMode', e.target.checked)} /> plan ahead</label>
        <select value="" onChange={(e) => load(e.target.value)} aria-label="Load a preset plan">
          <option value="">Load a preset…</option>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button onClick={() => { if (confirm('Clear every node of the tree?')) { player.setTree(emptyTree()); setSel(null); } }}>Clear</button></>}>
        <div className="tree-scroll" tabIndex={0} role="region" aria-label="Tree of Wisdoms diagram">
        <svg className="tree" viewBox="-700 -610 1400 1220" role="group" aria-label="Tree of Wisdoms">
          <circle r="496" className="ring" /><circle r="265" className="ring faint" />
          {WISDOMS.map((w, i) => {
            const a = angle(i), end = pos(w.id, 9), lab = { x: Math.cos(a) * 592, y: Math.sin(a) * 548 + 8 };
            const icon = iconUrl('wisdom', w.id);
            return (
              <g key={w.id}>
                <line x1={0} y1={0} x2={end.x} y2={end.y} className="branch" style={{ stroke: ART_COLOR[w.art] }} />
                {icon && <image href={icon} x={lab.x - 17} y={lab.y - 38} width={34} height={34} />}
                <text x={lab.x} y={lab.y + 12} className="wlabel" style={{ fill: ART_COLOR[w.art] }}>{w.name}</text>
                <text x={lab.x} y={lab.y + 27} className="wsub">{stats.perWisdom[w.id]}/9 · {w.art}</text>
              </g>);
          })}
          {TREE_LINKS.map(([a, b], i) => {
            const p1 = pos(a[0], a[1]), p2 = pos(b[0], b[1]);
            const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, d = Math.hypot(mx, my) || 1;
            const bulge = (R(a[1]) + R(b[1])) / 2 * 1.06;
            const live = !!filled(tree, a[0], a[1]) || !!filled(tree, b[0], b[1]);
            return <path key={i} d={`M${p1.x} ${p1.y} Q${(mx / d) * bulge} ${(my / d) * bulge} ${p2.x} ${p2.y}`} className={`fly ${live ? 'live' : ''}`} />;
          })}
          <g className={`node rootnode ${player.journalCommitted ? 'filled' : 'open'} ${sel === 'root' ? 'sel' : ''}`} tabIndex={0} role="button"
            aria-label={`Root of the tree: ${player.journalCommitted ? `${lib.journal.name} committed, grants ${element(lib.journal.element).name}` : 'your journal can be committed here'}`}
            aria-pressed={sel === 'root'} onClick={() => setSel('root')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel('root'); } }}>
            <title>Root: {lib.journal.name}</title>
            <circle r="24" />
            {iconUrl('item', 'journal') && <image href={iconUrl('item', 'journal')!} x={-17} y={-17} width={34} height={34} opacity={player.journalCommitted ? 1 : 0.45} />}
          </g>
          {WISDOMS.map((w) => Array.from({ length: 9 }, (_, k) => {
            const level = k + 1, { x, y } = pos(w.id, level);
            const id = filled(tree, w.id, level);
            const skill = id ? data.skillById[id] : null;
            const el = skill ? elementFor(skill, w.id) : null;
            const can = reachable(tree, w.id, level, player.journalCommitted);
            const isSel = sel !== null && sel !== 'root' && sel.wisdom === w.id && sel.level === level;
            const bad = issueKeys.has(`${w.id}:${level}`);
            const icon = skill ? (skill.icon ? iconUrl('skill', skill.id) : skill.isLanguage ? iconUrl('skill', 'language') : null) : null;
            const badge = el ? iconUrl('soul', el) : null;
            const label = `${w.name} level ${level}: ${skill ? `${skill.name}, grants ${element(el!).name}` : can ? 'empty, reachable' : 'empty, not reachable yet'}`;
            return (
              <g key={`${w.id}:${level}`} transform={`translate(${x} ${y})`} tabIndex={0} role="button" aria-label={label} aria-pressed={isSel}
                className={`node ${skill ? 'filled' : can ? 'open' : 'locked'} ${isSel ? 'sel' : ''} ${bad ? 'bad' : ''}`}
                onClick={() => setSel({ wisdom: w.id, level })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel({ wisdom: w.id, level }); } }}>
                <title>{label}</title>
                <circle r="19" style={skill ? { stroke: ART_COLOR[w.art] } : undefined} />
                {skill && icon ? <image href={icon} x={-17} y={-17} width={34} height={34} clipPath="circle(17px at 17px 17px)" />
                  : <text className="nlevel" y={5}>{skill ? skill.name.slice(0, 2) : level}</text>}
                {skill && badge && <><circle className="badge" cx={15} cy={-15} r={9.5} /><image href={badge} x={7} y={-23} width={16} height={16} /></>}
              </g>);
          }))}
        </svg>
        </div>
        <p className="muted small">Commit your journal at the root to open the first node of every Wisdom. Dotted curves are flying lines. A further node opens when a neighbour on its branch, or the node at the other end of a flying line, is filled.
          Preset plans are from <a href={PRESET_SOURCE} target="_blank" rel="noreferrer">Minmax'd Wisdom Trees et al.</a> by SCPantera.</p>
        {issues.length > 0 && <div className="issues"><b>{issues.length} node(s) break a rule{plan ? '' : ' with your current skill levels'}:</b>
          <ul>{issues.slice(0, 8).map((i, k) => <li key={k}>{wisdom(i.wisdom).name} {i.level} · {data.skillById[i.skill]?.name ?? i.skill}: {i.problem}</li>)}</ul>
          {issues.length > 8 && <p className="small muted">…and {issues.length - 8} more. Turn on "plan ahead" to ignore skill levels.</p>}</div>}
      </Panel>

      <div className="tree-side">
        {sel === 'root' ? (
          <Panel title="Root of the Tree">
            <p className="muted small">The journal of {lib.name} (<a href="#/">change</a>).</p>
            <div className="current"><div><b>{lib.journal.name}</b> → <Soul id={lib.journal.element} /></div>
              <button className={player.journalCommitted ? 'danger' : ''} onClick={() => player.setJournal(!player.journalCommitted)}>{player.journalCommitted ? 'Remove' : 'Commit journal'}</button></div>
            <p className="small muted">Committing the journal opens the Tree and grants one {element(lib.journal.element).name} card, counted in the statistics below. Mastering the journal as a book only gives its lessons.</p>
          </Panel>)
        : sel ? <NodePanel data={data} wisdomId={sel.wisdom} level={sel.level} onRemove={remove} /> :
          <Panel title="Select a node"><p className="muted">Click a node to see the skills that can be committed there.</p></Panel>}
      </div>
      <div className="tree-stats">
        <Panel title="Elements of the Soul" actions={
          <label className="check"><input type="checkbox" checked={evolveAll} onChange={(e) => setEvolveAll(e.target.checked)} /> evolve as far as possible</label>}>
          <p className="muted small">{stats.committed} of 73 skills committed. {lib.name} started with Health, {start.map((e) => element(e).name).join(', ')}{journal ? `; journal adds ${element(journal).name}` : '; journal not committed'} (<a href="#/settings">change</a>).</p>
          <table className="stats">
            <thead><tr><th>Element</th><th className="num" title="Starting cards (and journal) + cards from the tree">Cards</th><th className="num" title="Committed skills attuned to it; each powers one evolution">Attuned</th><th>Resulting hand</th></tr></thead>
            <tbody>{stats.elements.map((e) => (
              <tr key={e.element}><td><Soul id={e.element} /></td><td className="num">{e.start} + {e.fromTree}</td><td className="num">{e.attuned}</td>
                <td>{e.hand.map((n, lvl) => n ? <span key={lvl} className="hand">{n}× {element(e.element).name}{LEVEL_SUFFIX[lvl]}</span> : null)}{e.base === 0 && <span className="muted">none</span>}</td></tr>))}</tbody>
          </table>
          <h4>Best single soul card per Principle</h4>
          <p className="chips">{PRINCIPLE_IDS.map((p) => <P key={p} id={p} value={stats.bestPerPrinciple[p] ?? 0} short />)}</p>
          <div className="row"><button onClick={() => player.soulFromTree(data, evolveAll)}>Apply this hand to my Tracker</button></div>
        </Panel>
      </div>
    </div>
  );
}

function NodePanel({ data, wisdomId, level, onRemove }: { data: GameData; wisdomId: WisdomId; level: number; onRemove: (w: WisdomId, l: number) => void }) {
  const player = usePlayer();
  const w = wisdom(wisdomId);
  const plan = player.settings.planMode;
  const current = filled(player.tree, wisdomId, level);
  const can = reachable(player.tree, wisdomId, level, player.journalCommitted);
  const rows = useMemo(() => pickerRows(data, player, wisdomId, level), [data, player, wisdomId, level]);
  const links = TREE_LINKS.filter(([a, b]) => (a[0] === wisdomId && a[1] === level) || (b[0] === wisdomId && b[1] === level))
    .map(([a, b]) => (a[0] === wisdomId && a[1] === level ? b : a));
  const groups: [string, string, typeof rows][] = [
    ['Applicable', `Owned at level ${level} or higher, and free.`, rows.filter((r) => r.group === 'applicable')],
    [plan ? 'Applicable in plan mode' : 'Not yet', plan ? 'Free, but unowned or below the level needed.' : `Free, but below level ${level}. Turn on "plan ahead" to place them anyway.`, rows.filter((r) => r.group === 'plan')],
    ['Committed elsewhere', 'Selecting one moves it here.', rows.filter((r) => r.group === 'elsewhere')],
  ];
  return (
    <Panel title={<>{w.name} · level {level}</>}>
      <p className="small muted">{w.art}. Grants <Soul id={w.elements[0]} /> or <Soul id={w.elements[1]} />, depending on the skill.
        {links.length > 0 && <> Flying line to {links.map(([lw, ll]) => `${wisdom(lw).name} ${ll}`).join(' and ')}.</>}</p>
      {current && <div className="current"><div className="withicon"><SkillIcon skill={data.skillById[current]} size={34} /><span><b>{data.skillById[current]?.name}</b> → <Soul id={elementFor(data.skillById[current], wisdomId)!} /></span></div>
        <button className="danger" onClick={() => onRemove(wisdomId, level)}>Remove</button></div>}
      {!can && !current && <p className="warn">Not reachable yet: {level === 1 ? 'commit your journal at the root of the Tree' : `fill a neighbouring node${links.length ? ' or the other end of its flying line' : ''}`} first.</p>}
      {groups.map(([name, hint, list]) => list.length > 0 && (
        <div key={name} className="group"><h4>{name} <span className="muted">({list.length})</span></h4><p className="small muted">{hint}</p>
          <ul className="picker">{list.map((r) => {
            const allowed = can && (r.group === 'applicable' || plan);
            return (
              <li key={r.skill.id}>
                <button disabled={!allowed} onClick={() => player.place(wisdomId, level, r.skill.id)} title={allowed ? `Commit ${r.skill.name} here` : can ? 'Skill level too low' : 'Node not reachable'}>
                  <span className="pname"><SkillIcon skill={r.skill} size={24} /> {r.skill.name}{r.skill.isLanguage && <span className="tag">Language</span>}<span className="muted"> · {r.level ? `level ${r.level}` : 'not owned'}</span></span>
                  <span className="pmeta"><P id={r.skill.primary} short /><P id={r.skill.secondary} short /> here <Soul id={r.element} />
                    <span className="muted"> · or {wisdom(r.otherWisdom).name}: {element(r.otherElement).name}</span></span>
                  {r.where && <span className="small muted">now at {wisdom(r.where.wisdom).name} {r.where.level}</span>}
                </button>
              </li>);
          })}</ul></div>))}
    </Panel>
  );
}
