import { useEffect, useRef, useState } from 'react';
import type { BugsAlbum } from './bugsAlbum';
import { getAlbumTrackAliases, lookupOnlineLyrics } from './onlineLyrics';

interface Props {
  album: BugsAlbum;
  existingIds: ReadonlySet<string>;
  existingEmptyIds: ReadonlySet<string>;
  onResults: (lyrics: Record<string, string>) => void;
  onBusyChange?: (busy: boolean) => void;
}

export default function OnlineLyricsPanel({ album, existingIds, existingEmptyIds, onResults, onBusyChange }: Props) {
  const [manualArtist, setManualArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const found = useRef<Record<string, string>>({});
  const busyChange = useRef(onBusyChange);
  busyChange.current = onBusyChange;

  useEffect(() => {
    // Each album preview mounts a fresh panel. Defer the request past StrictMode's mount check.
    const start = album.source === 'apple' ? window.setTimeout(() => void lookup(), 0) : undefined;
    return () => {
      window.clearTimeout(start);
      controller.current?.abort();
      controller.current = null;
      busyChange.current?.(false);
    };
  }, []);

  const eligible = album.tracks.filter(t => !existingIds.has(t.id) || existingEmptyIds.has(t.id));
  const needsArtist = eligible.some(t => !t.artist && !album.artist);
  const pending = eligible.filter(t => !found.current[t.id]);
  const mayStart = pending.length > 0 && (!needsArtist || manualArtist.trim().length > 0);

  async function lookup() {
    if (!mayStart || controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true);
    onBusyChange?.(true);
    setUnavailable([]);
    let completed = 0;
    let errors = 0;
    let consecutiveErrors = 0;
    let stopped = '';
    const missing: string[] = [];
    try {
      for (const track of pending) {
        setStatus(`${completed + 1}/${pending.length} 조회 중 · ${track.title}`);
        const query = {
          title: track.title,
          artist: track.artist || album.artist || manualArtist.trim(),
          albumTitle: album.title === `앨범 ${album.id}` ? undefined : album.title,
          duration: track.duration,
          ...getAlbumTrackAliases(album.id, track.number, track.title),
        };
        let result = await lookupOnlineLyrics(query, job.signal);
        if (result.status === 'error' && result.retryAfter > 0 && result.retryAfter <= 5) {
          const delay = result.retryAfter * 1000 + 100;
          setStatus(`잠시 후 재시도 · ${track.title}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          if (job.signal.aborted) return;
          result = await lookupOnlineLyrics(query, job.signal);
        }
        if (job.signal.aborted) return;
        completed++;
        consecutiveErrors = result.status === 'error' ? consecutiveErrors + 1 : 0;
        if (result.status === 'found') {
          found.current = { ...found.current, [track.id]: result.lyrics };
          onResults(found.current);
        } else if (result.status === 'missing') {
          missing.push(track.title);
        } else {
          errors++;
          if (result.retryAfter != null || consecutiveErrors >= 2) {
            stopped = result.message;
            break;
          }
        }
      }
    } catch {
      if (job.signal.aborted) return;
      stopped = '연결이 끊겼습니다. 잠시 후 다시 조회해 주세요.';
    } finally {
      if (!job.signal.aborted) {
        setUnavailable(missing);
        setStatus([
          `가사 찾음 ${Object.keys(found.current).length}곡`,
          missing.length ? `일치하는 가사 없음 ${missing.length}곡` : '',
          errors ? `조회 오류 ${errors}곡` : '',
          stopped,
        ].filter(Boolean).join(' · '));
        setBusy(false);
        onBusyChange?.(false);
        controller.current = null;
      }
    }
  }

  function stop() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    onBusyChange?.(false);
    setStatus(`조회 중지 · 지금까지 가사 찾음 ${Object.keys(found.current).length}곡`);
  }

  return (
    <section aria-label="온라인 가사" className="space-y-2 rounded-lg border border-indigo-200 p-3 dark:border-indigo-900">
      <h4 className="text-sm font-semibold">온라인 가사</h4>
      <p className="text-xs leading-relaxed text-slate-600 dark:text-neutral-300"><a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline">LRCLIB</a>에서 곡명과 아티스트가 일치하는 가사를 찾습니다. 찾은 가사는 선택한 슬롯의 본문에 저장됩니다.</p>
      {needsArtist && <label className="block text-xs font-medium">가수 이름
        <input value={manualArtist} disabled={busy} onChange={e => {
          setManualArtist(e.target.value);
          found.current = {};
          onResults({});
          setStatus('');
          setUnavailable([]);
        }} placeholder="가사 조회에 사용할 아티스트 이름"
          className="mt-1 block w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
      </label>}
      {busy ? <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={stop}>조회 중지</button>
        : <button type="button" disabled={!mayStart} onClick={lookup}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">온라인 가사 조회</button>}
      {(status || !eligible.length) && <p role="status" className="text-xs">{status || '이 앨범의 모든 슬롯에 이미 가사가 있습니다.'}</p>}
      {unavailable.length > 0 && <details className="text-xs text-slate-600 dark:text-neutral-300"><summary>일치하는 가사가 없는 곡</summary>
        <ul className="mt-1 list-inside list-disc">{unavailable.map((title, i) => <li key={i}>{title}</li>)}</ul>
      </details>}
    </section>
  );
}
