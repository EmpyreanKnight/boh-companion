import { useEffect, useState } from 'react';
import { useHash } from './components/ui';
import { loadData } from './engine/data';
import type { GameData } from './engine/types';
import { Database } from './pages/Database';
import { Home } from './pages/Home';
import { House } from './pages/House';
import { Crafting } from './pages/Crafting';
import { Foraging } from './pages/Foraging';
import { Settings } from './pages/Settings';
import { Tracker } from './pages/Tracker';
import { Tree } from './pages/Tree';

const NAV = [['/', 'Home'], ['/db/books', 'Database'], ['/tracker', 'Tracker'], ['/crafting', 'Crafting'], ['/foraging', 'Foraging'], ['/house', 'Hush House'],
  ['/tree', 'Tree of Wisdoms'], ['/settings', 'Settings']] as const;

export function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash] = useHash();
  useEffect(() => { loadData().then(setData, (e) => setError(String(e.message ?? e))); }, []);
  const path = hash.split('?')[0];
  const section = '/' + (path.split('/')[1] ?? '');
  let page = null;
  if (data) {
    if (section === '/db') page = <Database data={data} path={path} />;
    else if (section === '/tracker') page = <Tracker data={data} />;
    else if (section === '/crafting' || section === '/recipes') page = <Crafting data={data} path={path} />;   // '/recipes' is the old address
    else if (section === '/foraging') page = <Foraging data={data} />;
    else if (section === '/tree') page = <Tree data={data} />;
    else if (section === '/house') page = <House data={data} />;
    else if (section === '/settings') page = <Settings data={data} />;
    else page = <Home data={data} />;
  }
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">Book of Hours <span>Companion</span></a>
        <nav aria-label="Main">
          {NAV.map(([href, label]) => (
            <a key={href} href={`#${href}`} {...((href === '/' ? section === '/' : section === '/' + href.split('/')[1]) ? { className: 'on', 'aria-current': 'page' as const } : {})}>{label}</a>
          ))}
        </nav>
      </header>
      <main>
        {error && <p className="error">Could not load game data: {error}</p>}
        {!data && !error && <p className="muted">Loading the library…</p>}
        {page}
      </main>
      <footer className="foot">
        Game data from the <a href="https://book-of-hours.fandom.com" target="_blank" rel="noreferrer">Book of Hours Wiki</a> (CC BY-SA)
        {data && <> · crawled {data.manifest.dataVersion}</>}. Book of Hours and its artwork belong to Weather Factory; this is an unofficial fan tool.
        Your progress is stored only in this browser.
      </footer>
    </div>
  );
}
