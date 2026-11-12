import { useMemo, useState } from 'react';
import { ItemIcon, Lore, P, Panel, PList, PrincipleFilter, SkillIcon, Status, TableWrap } from '../components/ui';
import { TIER_THRESHOLD } from '../engine/constants';
import { BANDS, planRecipe, recipeStatus, STATUS_RANK } from '../engine/engine';
import type { GameData, PrincipleId, Recipe, Tier } from '../engine/types';
import { useCtx, usePlayer } from '../store';

export const STATUS_LABEL = { ready: 'Ready', items: 'Ready using my items', blocked: 'Blocked', nowhere: 'No station known' } as const;

export function PinButton({ id, name }: { id: string; name: string }) {
  const pinned = usePlayer((s) => !!s.pinnedRecipes[id]);
  const toggle = usePlayer((s) => s.toggle);
  return (
    <button className={`pin ${pinned ? 'on' : ''}`} aria-pressed={pinned} title={pinned ? 'Unpin this recipe' : 'Pin this recipe'}
      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle('pinnedRecipes', id); }}>
      {pinned ? '★' : '☆'}
    </button>);
}
const TIER_NAME: Record<Tier, string> = { prentice: 'Prentice', scholar: 'Scholar', keeper: 'Keeper' };

export function Crafting({ data, path }: { data: GameData; path: string }) {
  const player = usePlayer();
  const selected = decodeURIComponent(path.split('/')[2] ?? '');
  const [q, setQ] = useState('');
  const [p, setP] = useState<PrincipleId | ''>('');
  const [tier, setTier] = useState<Tier | ''>('');
  const [only, setOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const ctx = useCtx(data);
  const statuses = useMemo(() => new Map(data.recipes.map((r) => [r.id, recipeStatus(ctx, r)])), [ctx, data]);
  const list = data.recipes.filter((r) => {
    if (p && r.principle !== p) return false;
    if (tier && r.tier !== tier) return false;
    if (only && !['ready', 'items'].includes(statuses.get(r.id)!)) return false;
    if (pinnedOnly && !player.pinnedRecipes[r.id]) return false;
    const t = q.trim().toLowerCase();
    return !t || r.resultName.toLowerCase().includes(t) || r.skills.some((s) => data.skillById[s].name.toLowerCase().includes(t));
  }).sort((a, b) => Number(!!player.pinnedRecipes[b.id]) - Number(!!player.pinnedRecipes[a.id])
    || STATUS_RANK[statuses.get(a.id)!] - STATUS_RANK[statuses.get(b.id)!]);
  const pinCount = Object.keys(player.pinnedRecipes).length;
  const recipe = data.recipes.find((r) => r.id === selected) ?? null;
  return (
    <div className="split">
      <Panel title="Crafting">
        <input className="search wide" type="search" placeholder="Search by result or skill…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
        <PrincipleFilter value={p} onChange={setP} />
        <div className="row filters">
          <label>Tier <select value={tier} onChange={(e) => setTier(e.target.value as Tier | '')}>
            <option value="">any</option><option value="prentice">Prentice (5)</option><option value="scholar">Scholar (10)</option><option value="keeper">Keeper (15)</option></select></label>
          <label className="check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> craftable now</label>
          <label className="check"><input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} /> pinned ({pinCount})</label>
        </div>
        <p className="muted count">{list.length} of {data.recipes.length} recipes</p>
        <ul className="recipe-list">
          {list.map((r) => (
            <li key={r.id} className={player.pinnedRecipes[r.id] ? 'pinned' : ''}><a href={`#/crafting/${encodeURIComponent(r.id)}`} className={r.id === selected ? 'on' : ''}>
              <span className="ricon"><ItemIcon item={data.itemById[r.result]} size={34} /></span>
              <span className="rname">{r.resultName}</span>
              <span className="rmeta"><P id={r.principle} short /> {TIER_NAME[r.tier]}{r.ingredient && <> · {r.ingredient.label}</>}</span>
              <Status kind={statuses.get(r.id)!}>{STATUS_LABEL[statuses.get(r.id)!]}</Status>
              <PinButton id={r.id} name={r.resultName} />
            </a></li>))}
        </ul>
      </Panel>
      <div>{recipe ? <RecipeDetail data={data} recipe={recipe} /> : <Panel title="Pick a recipe"><p className="muted">Select a recipe on the left to see which workstations can make it and what you would place in each slot.</p></Panel>}</div>
    </div>
  );
}

function RecipeDetail({ data, recipe }: { data: GameData; recipe: Recipe }) {
  const player = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  const ctx = useCtx(data);
  const plans = useMemo(() => planRecipe(ctx, recipe), [ctx, recipe]);
  const need = TIER_THRESHOLD[recipe.tier];
  const chain = useMemo(() => {
    const out: Recipe[] = [recipe];
    let cur = recipe;
    while (cur.ingredient?.item) {
      const prev = data.recipes.find((r) => r.result === cur.ingredient!.item && !out.includes(r));
      if (!prev) break;
      out.unshift(prev); cur = prev;
    }
    return out;
  }, [data, recipe]);
  const item = data.itemById[recipe.result];
  return (
    <>
      <Panel title={<><ItemIcon item={item} size={36} /> {recipe.resultName}</>} actions={<PinButton id={recipe.id} name={recipe.resultName} />}>
        <div className="req">
          <div><h4>Requires</h4>
            <p><b>{need}</b> <P id={recipe.principle} /> <span className="muted">({TIER_NAME[recipe.tier]}-level)</span></p>
            {recipe.ingredient && <p>Ingredient: {recipe.ingredient.item
              ? <><ItemIcon item={data.itemById[recipe.ingredient.item]} size={22} /> <a href={`#/db/items/${recipe.ingredient.item}`}>{recipe.ingredient.label}</a></>
              : <>any card with the aspect <b>{recipe.ingredient.label}</b></>}
              {recipe.ingredient.item && <> {ctx.have.has(recipe.ingredient.item) ? <Status kind="ready">have it ({ctx.have.get(recipe.ingredient.item)})</Status> : <Status kind="blocked">do not have it</Status>}</>}</p>}
            <p>One of these skills:</p>
            <ul className="skill-req">{recipe.skills.map((id) => {
              const s = data.skillById[id]; const lvl = player.skills[id] ?? 0;
              return <li key={id} className={lvl ? '' : 'muted'}><SkillIcon skill={s} size={22} /> <a href={`#/db/skills/${id}`}>{s.name}</a> {lvl ? <b>level {lvl}</b> : '(not owned)'}</li>;
            })}</ul></div>
          <div><h4>Makes</h4>
            <p><a href={`#/db/items/${recipe.result}`}>{recipe.resultName}</a></p>
            <Lore text={item?.description} />
            <p><PList map={item?.principles ?? recipe.resultPrinciples} /></p>
            <p className="small">{(item?.aspects ?? recipe.resultAspects).filter((a) => a !== 'Thing').join(', ')}</p>
            {chain.length > 1 && <><h4>Chain</h4><ol className="chain">{chain.map((r) => (
              <li key={r.id} className={r.id === recipe.id ? 'cur' : ''}><ItemIcon item={data.itemById[r.result]} size={20} /> <a href={`#/crafting/${encodeURIComponent(r.id)}`}>{r.resultName}</a> <span className="muted">{TIER_NAME[r.tier]}</span></li>))}</ol></>}</div>
        </div>
      </Panel>
      <Panel title={`Workstations (${plans.length})`}>
        {!plans.length && <p className="muted">No workstation in the wiki data fits a listed skill and accepts this ingredient.</p>}
        <TableWrap label="Workstations for this recipe"><table>
          <thead><tr><th>Workstation</th><th>Status</th>{BANDS.map((b) => <th key={b.id} className="num" title={b.hint}>{b.name}</th>)}<th>What is missing</th></tr></thead>
          <tbody>{plans.map((pl) => [
            <tr key={pl.station.id} className={open === pl.station.id ? 'open' : ''}>
              <td><button className="link name" onClick={() => setOpen(open === pl.station.id ? null : pl.station.id)}>{pl.station.name}</button>
                <div className="small"><span className="chips">{pl.station.principles.map((x) => <P key={x} id={x} short />)}</span></div></td>
              <td><Status kind={pl.status}>{STATUS_LABEL[pl.status]}</Status></td>
              {BANDS.map((b) => <td key={b.id} className="num">{pl.totals[b.id]}/{need}</td>)}
              <td className="small">{pl.gaps.join('; ') || '—'}</td>
            </tr>,
            open === pl.station.id && <tr key={pl.station.id + ':d'} className="detail"><td colSpan={6}>
              <p className="small muted">{pl.station.kind}{pl.station.room && ` · ${pl.station.room}`}. Cards to place:</p>
              <ul className="picks">{pl.picks.map((k, i) => <li key={i}><span className="slot">{k.slot}</span> {k.card ? <>{k.card.name} <b>+{k.value}</b>{k.card.via && <span className="muted small"> ({k.card.via})</span>}</> : <span className="muted">empty</span>}</li>)}</ul>
            </td></tr>,
          ])}</tbody>
        </table></TableWrap>
      </Panel>
    </>
  );
}
