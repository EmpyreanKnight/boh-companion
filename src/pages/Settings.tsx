import { useRef, useState } from 'react';
import { Panel } from '../components/ui';
import type { GameData } from '../engine/types';
import { exportState, STORAGE_KEY, usePlayer, validateImport } from '../store';

export function Settings({ data }: { data: GameData }) {
  const player = usePlayer();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const download = () => {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'boh-companion-save.json'; link.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (f: File) => {
    try { player.replaceAll(validateImport(JSON.parse(await f.text()))); setMsg('Save imported.'); }
    catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };
  return (
    <>
      <Panel title="Preferences">
        <p className="muted">Which Librarian you were is chosen on the <a href="#/">Home</a> page.</p>
        <label className="check"><input type="checkbox" checked={player.settings.countRoomContents}
          onChange={(e) => player.setSetting('countRoomContents', e.target.checked)} />
          Count things lying in rooms I have unlocked as things I have</label>
        <label className="check"><input type="checkbox" checked={player.settings.assumeAllStationsUnlocked}
          onChange={(e) => player.setSetting('assumeAllStationsUnlocked', e.target.checked)} />
          Treat every workstation as unlocked (otherwise a workstation is unlocked when its room is ticked on the Hush House page)</label>
        <label className="check"><input type="checkbox" checked={player.settings.hideUnfound}
          onChange={(e) => player.setSetting('hideUnfound', e.target.checked)} />
          Spoiler guard: hide names of books I have not mastered and skills I do not own</label>
      </Panel>
      <Panel title="Save data">
        <p className="muted">Progress is kept in this browser's local storage under <code>{STORAGE_KEY}</code>. Nothing is sent to any server.</p>
        <div className="row">
          <button onClick={download}>Export save (JSON)</button>
          <button onClick={() => file.current?.click()}>Import save…</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="danger" onClick={() => { if (confirm('Erase all recorded progress in this browser?')) { player.reset(); setMsg('Progress erased.'); } }}>Reset everything</button>
        </div>
        {msg && <p role="status">{msg}</p>}
      </Panel>
      <Panel title="About the data">
        <p>{data.manifest.counts.books} books, {data.manifest.counts.skills} skills, {data.manifest.counts.items} items,
          {' '}{data.manifest.counts.workstations} workstations, {data.manifest.counts.rooms} rooms and {data.manifest.counts.recipes} recipes, crawled from the{' '}
          <a href={data.manifest.source} target="_blank" rel="noreferrer">Book of Hours Wiki</a> on {data.manifest.dataVersion} ({data.manifest.license}).</p>
      </Panel>
    </>
  );
}
