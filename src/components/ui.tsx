import { useEffect, useState, type ReactNode } from 'react';
import { element, isMemory, LEVEL_SUFFIX, principle, PRINCIPLE_IDS } from '../engine/constants';
import type { ElementId, PMap, PrincipleId, WisdomId } from '../engine/types';

const ICONS = import.meta.env.VITE_ICONS !== 'off';
export type IconGroup = 'principle' | 'soul' | 'wisdom' | 'skill' | 'item' | 'person';
export const iconUrl = (group: IconGroup, id: string) =>
  ICONS ? `${import.meta.env.BASE_URL}icons/${group}-${id}.webp` : null;

export function Icon({ group, id, size = 18, square }: { group: IconGroup; id: string; size?: number; square?: boolean }) {
  const url = iconUrl(group, id);
  const [ok, setOk] = useState(true);
  if (!url || !ok) return null;
  return <img className={square ? 'icon card-icon' : 'icon'} src={url} width={size} height={size} alt="" loading="lazy" onError={() => setOk(false)} />;
}

/** Card art for a skill (languages share one icon). Renders nothing when the wiki has no image. */
export function SkillIcon({ skill, size = 28 }: { skill: { id: string; icon?: boolean; isLanguage: boolean }; size?: number }) {
  if (!skill.icon && !skill.isLanguage) return null;
  return <Icon group="skill" id={skill.icon ? skill.id : 'language'} size={size} square />;
}
/** A thing's Database entry: memories have a tab of their own. */
export const itemHref = (item: { id: string; aspects: string[] }) => `#/db/${isMemory(item) ? 'memories' : 'items'}/${item.id}`;
/** A link to the memory called `name` (as books and things name it), or the bare name when it is not a known card. */
export function MemoryLink({ data, name }: { data: { itemIdByName: Record<string, string> }; name: string | null | undefined }) {
  if (!name) return <>—</>;
  const id = data.itemIdByName[name];
  const label = name.replace('Memory: ', '');
  return id ? <a href={`#/db/memories/${id}`}>{label}</a> : <>{label}</>;
}
export function ItemIcon({ item, size = 28 }: { item?: { id: string; icon?: boolean } | null; size?: number }) {
  if (!item?.icon) return null;
  return <Icon group="item" id={item.id} size={size} square />;
}

/** Principle chip: icon, name and optional value. The name is always present; colour is never the only signal. */
export function P({ id, value, short }: { id: PrincipleId; value?: number; short?: boolean }) {
  const p = principle(id);
  return (
    <span className="chip" style={{ borderColor: p.color, color: p.color }} title={p.name}>
      <Icon group="principle" id={id} size={16} />
      {!short && <span>{p.name}</span>}
      {value !== undefined && <b>{value}</b>}
    </span>
  );
}

export function PList({ map, short }: { map: PMap; short?: boolean }) {
  const entries = PRINCIPLE_IDS.filter((p) => (map[p] ?? 0) > 0).sort((a, b) => (map[b] ?? 0) - (map[a] ?? 0));
  if (!entries.length) return <span className="muted">none</span>;
  return <span className="chips">{entries.map((p) => <P key={p} id={p} value={map[p]} short={short} />)}</span>;
}

export function Soul({ id, level = 0 }: { id: ElementId; level?: number }) {
  return <span className="soul"><Icon group="soul" id={id} size={18} />{element(id).name}{LEVEL_SUFFIX[level]}</span>;
}
export function WisdomName({ id, name }: { id: WisdomId; name: string }) {
  return <span className="soul"><Icon group="wisdom" id={id} size={18} />{name}</span>;
}

export function Panel({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      {(title || actions) && <header className="panel-head"><h2>{title}</h2><div className="actions">{actions}</div></header>}
      {children}
    </section>
  );
}

/**
 * A table that scrolls sideways when it is wider than the page. The wrapper is a named, focusable region
 * so that it can be scrolled from the keyboard and announced by a screen reader.
 */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

/** The current season as five buttons; pressing the chosen one again clears it. Shared by Foraging and Hush House. */
export function SeasonPicker({ value, onChange, seasons }: { value: string; onChange: (s: string) => void; seasons: string[] }) {
  return (
    <div className="pfilter" role="group" aria-label="Current season">
      {seasons.map((s) => <button key={s} className={value === s ? 'on' : ''} aria-pressed={value === s} onClick={() => onChange(value === s ? '' : s)}>{s}</button>)}
    </div>);
}

export function Stepper({ value, min = 0, max = 9, onChange, label }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>−</button>
      <output>{value}</output>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </span>
  );
}

export function PrincipleFilter({ value, onChange }: { value: PrincipleId | ''; onChange: (p: PrincipleId | '') => void }) {
  return (
    <div className="pfilter" role="group" aria-label="Filter by Principle">
      <button className={value === '' ? 'on' : ''} onClick={() => onChange('')}>All</button>
      {PRINCIPLE_IDS.map((p) => (
        <button key={p} className={value === p ? 'on' : ''} onClick={() => onChange(value === p ? '' : p)}
          style={{ borderColor: principle(p).color }} title={principle(p).name}>
          <Icon group="principle" id={p} size={16} /><span>{principle(p).name}</span>
        </button>
      ))}
    </div>
  );
}

export function useHash(): [string, (h: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [hash, (h) => { window.location.hash = h; }];
}

/** The in-game description of a thing, when the wiki quotes one. */
export const Lore = ({ text }: { text?: string | null }) => (text ? <p className="lore">{text}</p> : null);

export const Status = ({ kind, children }: { kind: 'ready' | 'items' | 'blocked' | 'nowhere'; children: ReactNode }) =>
  <span className={`status status-${kind}`}>{children}</span>;
