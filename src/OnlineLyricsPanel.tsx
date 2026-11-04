import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BugsAlbum, BugsTrack } from './bugsAlbum';
import {
  fetchConfirmedLyrics, getAlbumTrackAliases, lookupOnlineLyrics,
  type LyricsCandidate, type OnlineLyricsQuery, type OnlineLyricsResult,
} from './onlineLyrics';

interface Props {
  album: BugsAlbum;
  existingIds: ReadonlySet<string>;
  existingEmptyIds: ReadonlySet<string>;
  onResults: (lyrics: Record<string, string>) => void;
  onBusyChange?: (busy: boolean) => void;
}

interface TrackReport {
  candidates: LyricsCandidate[];
  error?: string;
  note?: string;
}

function time(seconds: number) {
  const n = Math.round(seconds);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

export default function OnlineLyricsPanel({ album, existingIds, existingEmptyIds, onResults, onBusyChange }: Props) {
  const [manualArtist, setManualArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [reports, setReports] = useState<Record<string, TrackReport>>({});
  const controller = useRef<AbortController | null>(null);
  const found = useRef<Record<string, string>>({});
  const recordOwners = useRef(new Map<number, string>());
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
  const unresolved = pending.filter(t => reports[t.id]);
  const errorCount = unresolved.filter(t => reports[t.id].error).length;
  const foundCount = Object.keys(found.current).length;
  const summary = [
    foundCount || unresolved.length ? `가사 찾음 ${foundCount}곡` : '',
    unresolved.length > errorCount ? `일치하는 가사 없음 ${unresolved.length - errorCount}곡` : '',
    errorCount ? `조회 오류 ${errorCount}곡` : '',
  ].filter(Boolean).join(' · ');

  function queryFor(track: BugsTrack): OnlineLyricsQuery {
    const aliases = getAlbumTrackAliases(album.id, track.number, track.title);
    const artist = track.artist || album.artist || manualArtist.trim();
    return {
      title: track.title, artist,
      albumTitle: album.title === `앨범 ${album.id}` ? undefined : album.title,
      duration: track.duration ?? aliases.duration,
      alternateTitle: track.alternateTitle || aliases.alternateTitle,
      alternateAlbumTitle: album.alternateAlbumTitle || aliases.alternateAlbumTitle,
      alternateArtist: track.alternateArtist || (artist === album.artist ? album.alternateArtist : undefined) || aliases.alternateArtist,
    };
  }

  function candidateIsAvailable(track: BugsTrack, candidate: LyricsCandidate) {
    if (recordOwners.current.has(candidate.id)) return false;
    const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    return !album.tracks.some(other => {
      if (other.id === track.id) return false;
      const known = queryFor(other);
      return (!known.duration || Math.abs(known.duration - candidate.duration) <= 2)
        && [known.title, known.alternateTitle].some(name => name && key(name) === key(candidate.title));
    });
  }

  function accept(track: BugsTrack, result: OnlineLyricsResult, note = '') {
    if (result.status === 'found') {
      const owner = recordOwners.current.get(result.recordId);
      if (!owner || owner === track.id) {
        recordOwners.current.set(result.recordId, track.id);
        found.current = { ...found.current, [track.id]: result.lyrics };
        onResults(found.current);
        return;
      }
      setReports(prev => ({ ...prev, [track.id]: { candidates: [], note: '이 가사는 다른 수록곡에 연결되어 있습니다.' } }));
    } else if (result.status === 'missing') {
      setReports(prev => ({ ...prev, [track.id]: {
        candidates: result.candidates?.length ? result.candidates : (note ? prev[track.id]?.candidates ?? [] : []),
        note,
      } }));
    } else {
      setReports(prev => ({ ...prev, [track.id]: { candidates: prev[track.id]?.candidates ?? [], error: result.message } }));
    }
  }

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await action(job.signal);
    } catch {
      if (!job.signal.aborted) setStatus('연결이 끊겼습니다. 다시 시도해 주세요.');
    } finally {
      if (controller.current === job) {
        setBusy(false);
        onBusyChange?.(false);
        controller.current = null;
      }
    }
  }

  async function lookup() {
    if (!mayStart) return;
    await run(async signal => {
      let consecutiveErrors = 0;
      for (const [index, track] of pending.entries()) {
        setStatus(`${index + 1}/${pending.length} 조회 중 · ${track.title}`);
        const query = queryFor(track);
        let result = await lookupOnlineLyrics(query, signal);
        if (signal.aborted) return;
        if (result.status === 'error' && result.retryAfter > 0 && result.retryAfter <= 5) {
          const delay = result.retryAfter * 1000 + 100;
          setStatus(`잠시 후 재시도 · ${track.title}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          if (signal.aborted) return;
          result = await lookupOnlineLyrics(query, signal);
        }
        if (signal.aborted) return;
        accept(track, result);
        consecutiveErrors = result.status === 'error' ? consecutiveErrors + 1 : 0;
        if (result.status === 'error' && (result.retryAfter != null || consecutiveErrors >= 2)) {
          setStatus(result.message);
          return;
        }
      }
      setStatus('');
    });
  }

  function retryTrack(track: BugsTrack, candidate?: LyricsCandidate, alternateTitle?: string) {
    if (candidate && !candidateIsAvailable(track, candidate)) return;
    void run(async signal => {
      setStatus(`${track.title} 가사 확인 중…`);
      const result = candidate
        ? await fetchConfirmedLyrics(candidate, signal)
        : await lookupOnlineLyrics({ ...queryFor(track), alternateTitle }, signal);
      if (signal.aborted) return;
      accept(track, result, '일치하는 가사를 확인하지 못했습니다.');
      setStatus(result.status === 'error' ? result.message : '');
    });
  }

  function submitTitle(event: FormEvent<HTMLFormElement>, track: BugsTrack) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (title) retryTrack(track, undefined, title);
  }

  function stop() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    onBusyChange?.(false);
    setStatus('조회를 중지했습니다.');
  }

  return (
    <section aria-label="온라인 가사" className="space-y-2 rounded-lg border border-indigo-200 p-3 dark:border-indigo-900">
      <h4 className="text-sm font-semibold">온라인 가사</h4>
      <p className="text-xs leading-relaxed text-slate-600 dark:text-neutral-300"><a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline">LRCLIB</a>에서 곡명과 아티스트가 일치하는 가사를 찾습니다. 찾은 가사는 선택한 슬롯의 본문에 저장됩니다.</p>
      {needsArtist && <label className="block text-xs font-medium">가수 이름
        <input value={manualArtist} disabled={busy} onChange={e => {
          setManualArtist(e.target.value);
          found.current = {};
          recordOwners.current.clear();
          onResults({});
          setStatus('');
          setReports({});
        }} placeholder="가사 조회에 사용할 아티스트 이름"
          className="mt-1 block w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
      </label>}
      {busy ? <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={stop}>조회 중지</button>
        : <button type="button" disabled={!mayStart} onClick={lookup}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">온라인 가사 조회</button>}
      {(status || summary || !eligible.length) && <p role="status" className="text-xs">{[status, busy ? '' : summary].filter(Boolean).join(' · ') || '이 앨범의 모든 슬롯에 이미 가사가 있습니다.'}</p>}
      {!!unresolved.length && <div className="space-y-1">
        <h5 className="text-xs font-semibold">다른 제목으로 가사 확인</h5>
        {unresolved.map(track => {
          const report = reports[track.id];
          const candidates = report.candidates.filter(c => candidateIsAvailable(track, c));
          const duration = queryFor(track).duration;
          return <details key={track.id} className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:border-neutral-700">
            <summary className="cursor-pointer break-words font-medium">{track.title}{duration ? ` (${time(duration)})` : ''}
              <span className="ml-2 font-normal">{candidates.length ? `제목이 다른 후보 ${candidates.length}개` : report.error ? '조회 오류' : '다른 제목 입력'}</span>
            </summary>
            {report.error && <p className="mt-2 text-red-700 dark:text-red-300">{report.error}</p>}
            {report.note && <p className="mt-2">{report.note}</p>}
            {candidates.length > 0 && <div className="mt-2 space-y-1">
              <p>아티스트·앨범과 재생시간이 비슷합니다. 같은 곡인지 확인한 뒤 선택하세요.</p>
              <ul className="divide-y divide-slate-200 dark:divide-neutral-700">
                {candidates.map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 break-words"><strong>{c.title}</strong><br />{c.artist} · {c.album} · {time(c.duration)}</span>
                  <button type="button" disabled={busy} onClick={() => retryTrack(track, c)}
                    aria-label={`${track.title}에 ${c.title} 가사 사용`}
                    className="rounded border px-2 py-1 font-medium disabled:opacity-50">이 곡의 가사 사용</button>
                </li>)}
              </ul>
            </div>}
            <form onSubmit={event => submitTitle(event, track)} className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">다른 언어 또는 표기의 곡명
                <input name="title" required disabled={busy} className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 dark:border-neutral-700" />
              </label>
              <button type="submit" disabled={busy} className="rounded border px-2 py-1.5 font-medium disabled:opacity-50">다시 찾기</button>
            </form>
          </details>;
        })}
      </div>}
    </section>
  );
}
