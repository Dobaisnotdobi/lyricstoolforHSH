import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BugsTrack } from './bugsAlbum';

const origin = 'https://music.bugs.co.kr';
const channel = 'lyrics-bugs-v1';
const batchLimit = 100;
const maxLyrics = 200000;
const maxBatchLyrics = 3000000;

type Track = BugsTrack & { trackId: string; artist: string; adult: boolean; url: string };
type Album = { title: string; artist: string; releaseDate?: string; tracks: Track[] };
type Status = 'ready' | 'restricted' | 'missing' | 'error';
type Phase = 'waiting' | 'selecting' | 'receiving' | 'done' | 'failed';
type Batch = {
  tracks: Map<string, Track>;
  items: Map<string, { status: Status; lyrics?: string }>;
  size: number;
};
interface SlotIds {
  existingIds: ReadonlySet<string>;
  existingEmptyIds: ReadonlySet<string>;
}
interface Props extends SlotIds {
  nonce: string;
  onAlbum?: (album: Album) => SlotIds | void;
  onImport: (tracks: (BugsTrack & {lyrics?: string})[], summary?: string) => void;
  onClose: () => void;
}

const statuses: Record<Status, string> = { ready: '가사 받음', restricted: '열람 제한', missing: '가사 미제공', error: '조회 오류' };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,17}$/.test(v);
const label = (v: unknown): v is string => typeof v === 'string' && v.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(v);
const mayFill = (t: Track, props: SlotIds) => !t.adult && (!props.existingIds.has(t.id) || props.existingEmptyIds.has(t.id));

function readAlbum(data: unknown): Album | null {
  if (!object(data) || data.source !== 'bookmark' || !id(data.id) || data.url !== `${origin}/album/${data.id}`
    || !label(data.title) || !data.title.trim() || !label(data.artist)
    || !Array.isArray(data.tracks) || !data.tracks.length || data.tracks.length > 500) return null;
  const date = data.releaseDate;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return null;
  const tracks: Track[] = [];
  const ids = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const row of data.tracks) {
    if (!object(row) || !id(row.trackId) || ids.has(row.trackId) || row.url !== `${origin}/track/${row.trackId}`
      || !label(row.title) || !row.title.trim() || !label(row.artist) || typeof row.adult !== 'boolean'
      || typeof row.number !== 'number' || !Number.isSafeInteger(row.number) || row.number < 1 || row.number > 9999) return null;
    const title = row.title.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const repeat = (occurrences.get(title) ?? 0) + 1;
    const slotId = `bugs:${data.id}:${title}:${repeat}`;
    if (row.id !== slotId) return null;
    ids.add(row.trackId);
    occurrences.set(title, repeat);
    tracks.push({ id: slotId, trackId: row.trackId, number: row.number, title: row.title.trim(),
      artist: row.artist, adult: row.adult, url: row.url });
  }
  return { title: data.title, artist: data.artist, releaseDate: typeof date === 'string' ? date : undefined, tracks };
}

export default function BugsBookmarkImport(props: Props) {
  const [opener] = useState<Window | null>(() => window.opener);
  const dialog = useRef<HTMLDialogElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [phase, setPhase] = useState<Phase>('waiting');
  const phaseRef = useRef<Phase>('waiting');
  const [album, setAlbum] = useState<Album | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, Status>>({});
  const [message, setMessage] = useState('');
  const batch = useRef<Batch | null>(null);
  const lastActivity = useRef(0);
  const allowed = album?.tracks.filter(t => mayFill(t, props)) ?? [];
  const chosen = allowed.filter(t => selected.has(t.trackId));

  function transition(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function send(type: 'ready' | 'import' | 'cancel', trackIds?: string[]) {
    if (!opener || opener.closed) return false;
    try {
      opener.postMessage({ channel, nonce: props.nonce, type, ...(trackIds ? { trackIds } : {}) }, origin);
      return true;
    } catch { return false; }
  }

  function fail(reason: string) {
    if (phaseRef.current === 'receiving') send('cancel');
    batch.current = null;
    setResults({});
    transition('failed');
    setMessage(reason);
  }

  function close() {
    if (phaseRef.current !== 'done') send('cancel');
    batch.current = null;
    phaseRef.current = 'done';
    props.onClose();
  }

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    batch.current = null;
    setAlbum(null);
    setSelected(new Set());
    setResults({});
    transition('waiting');
    setMessage('벅스 탭에서 수록곡 목록을 기다리고 있습니다.');
    if (!opener || opener.closed || !/^[a-f0-9]{32}$/.test(props.nonce)) {
      fail('벅스 앨범 페이지에서 북마클릿을 다시 실행해 주세요. 벅스 탭은 저장을 마칠 때까지 열어 두세요.');
      return;
    }
    lastActivity.current = Date.now();
    let sentReady = false;

    function receive(event: MessageEvent) {
      if (event.origin !== origin || event.source !== opener) return;
      const data = event.data;
      if (!object(data) || data.channel !== channel || data.nonce !== props.nonce) return;
      if ((phaseRef.current === 'selecting' || phaseRef.current === 'waiting') && data.type === 'done') {
        fail('벅스 탭에서 연결이 종료되었습니다. 원본 앨범에서 북마클릿을 다시 실행해 주세요.');
        return;
      }
      if (phaseRef.current === 'waiting' && data.type === 'album') {
        const incoming = readAlbum(data.album);
        if (!incoming) { fail('벅스 앨범과 곡 주소를 확인할 수 없습니다. 원본 앨범에서 다시 시작해 주세요.'); return; }
        const slots = latest.current.onAlbum?.(incoming) || latest.current;
        setAlbum(incoming);
        setSelected(new Set(incoming.tracks.filter(t => mayFill(t, slots)).slice(0, batchLimit).map(t => t.trackId)));
        setMessage('');
        transition('selecting');
        return;
      }
      const current = batch.current;
      if (phaseRef.current !== 'receiving' || !current) return;
      if (data.type === 'progress') {
        if (data.total === current.tracks.size && Number.isInteger(data.index) && Number(data.index) >= 0
          && Number(data.index) <= current.tracks.size && label(data.title)
          && [...current.tracks.values()].some(track => track.title === data.title)) {
          lastActivity.current = Date.now();
          setMessage(`벅스에서 조회 중 · ${data.title}`);
        }
      } else if (data.type === 'item') {
        const trackId = data.trackId;
        if (!id(trackId) || !current.tracks.has(trackId) || current.items.has(trackId)) return;
        const status = data.status;
        if (status !== 'ready' && status !== 'missing' && status !== 'restricted' && status !== 'error') return;
        if (status === 'ready') {
          if (typeof data.lyrics !== 'string' || data.lyrics.length > maxLyrics || !data.lyrics.trim()
            || current.size + data.lyrics.length > maxBatchLyrics) {
            fail('가사 데이터가 비어 있거나 허용 크기를 넘었습니다. 곡 수를 줄여 다시 시작해 주세요.');
            return;
          }
          current.size += data.lyrics.length;
          current.items.set(trackId, { status, lyrics: data.lyrics });
        } else {
          current.items.set(trackId, { status });
        }
        lastActivity.current = Date.now();
        setResults(prev => ({ ...prev, [trackId]: status }));
      } else if (data.type === 'done') {
        const saved: (Track & { lyrics: string })[] = [];
        const counts = { restricted: 0, missing: 0, error: 0, skipped: 0 };
        for (const [trackId, track] of current.tracks) {
          const item = current.items.get(trackId);
          if (!item) counts.skipped++;
          else if (item.status !== 'ready') counts[item.status]++;
          else if (mayFill(track, latest.current)) saved.push({ ...track, lyrics: item.lyrics! });
          else counts.skipped++;
        }
        const summary = [`저장 ${saved.length}곡`, counts.missing && `가사 미제공 ${counts.missing}곡`,
          counts.restricted && `열람 제한 ${counts.restricted}곡`, counts.error && `조회 오류 ${counts.error}곡`,
          counts.skipped && `건너뜀 ${counts.skipped}곡`, label(data.reason) && data.reason.length <= 240 && data.reason]
          .filter(Boolean).join(' · ');
        batch.current = null;
        transition('done');
        if (saved.length) {
          try { latest.current.onImport(saved, summary); }
          catch {
            fail('브라우저에 가사를 저장하지 못했습니다. 뷰어의 저장 공간과 사이트 설정을 확인한 뒤 다시 시도해 주세요.');
            return;
          }
        }
        setMessage(summary);
      }
    }

    window.addEventListener('message', receive);
    // Defer external contact until after React StrictMode's mount probe.
    const start = window.setTimeout(() => {
      sentReady = send('ready');
      if (!sentReady) fail('벅스 탭에 연결할 수 없습니다. 원본 앨범에서 다시 시작해 주세요.');
    }, 0);
    const watch = window.setInterval(() => {
      const active = phaseRef.current;
      if (active === 'done' || active === 'failed') return;
      if (opener.closed) fail('연결한 벅스 탭이 닫혔습니다. 원본 앨범을 열고 다시 시작해 주세요.');
      else if ((active === 'waiting' || active === 'receiving') && Date.now() - lastActivity.current > (active === 'waiting' ? 15000 : 45000)) {
        fail('벅스 탭의 응답 시간이 초과되었습니다. 벅스 앨범 페이지를 확인해 주세요.');
      }
    }, 1000);
    const exit = () => {
      if (sentReady && phaseRef.current !== 'done') send('cancel');
      batch.current = null;
      phaseRef.current = 'done';
    };
    window.addEventListener('pagehide', exit);
    return () => {
      clearTimeout(start);
      clearInterval(watch);
      window.removeEventListener('message', receive);
      window.removeEventListener('pagehide', exit);
      exit();
    };
  }, [opener, props.nonce]);

  function reconnect() {
    if (!/^[a-f0-9]{32}$/.test(props.nonce) || !send('ready')) return;
    lastActivity.current = Date.now();
    transition('waiting');
    setMessage('벅스 탭과 다시 연결하고 있습니다.');
  }

  function begin() {
    if (phaseRef.current !== 'selecting' || !chosen.length || chosen.length > batchLimit) return;
    batch.current = { tracks: new Map(chosen.map(t => [t.trackId, t])), items: new Map(), size: 0 };
    lastActivity.current = Date.now();
    transition('receiving');
    setMessage('벅스에서 선택한 곡의 가사를 확인하고 있습니다.');
    if (!send('import', chosen.map(t => t.trackId))) fail('벅스 탭과 연결이 끊겼습니다. 원본 앨범에서 다시 시작해 주세요.');
  }

  return (
    <dialog ref={dialog} aria-labelledby="bookmark-heading" onCancel={e => { e.preventDefault(); close(); }}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); }}
      className="ui-chrome m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/45 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex max-h-[86dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-neutral-700">
          <h2 id="bookmark-heading" className="text-lg font-bold">벅스 가사 가져오기</h2>
          <button type="button" aria-label="가져오기 창 닫기" onClick={close} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-neutral-800"><X size={18} /></button>
        </header>
        <div className="custom-scrollbar space-y-3 overflow-y-auto p-4">
          {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-neutral-800">{message}</p>}
          {phase === 'receiving' && <p className="text-xs">{Object.keys(results).length} / {batch.current?.tracks.size}곡 확인 · 도중에 취소하면 저장을 취소합니다.</p>}
          {album && <>
            <h3 className="break-words font-semibold">{album.title}</h3>
            <p className="text-sm text-slate-600 dark:text-neutral-300">{[album.artist, album.releaseDate, `수록곡 ${album.tracks.length}곡`].filter(Boolean).join(' · ')}</p>
            {phase === 'selecting' && <>
              <p className="text-sm">복사·저장할 권한이 있는 곡을 선택하세요. 선택한 가사는 이 브라우저의 새 슬롯이나 기존 빈 슬롯에 저장됩니다.</p>
              {!allowed.length && <p className="text-sm">이 앨범의 곡은 이미 가사가 있거나 열람이 제한되어 있습니다.</p>}
              {allowed.length > batchLimit && <p className="text-xs">한 번에 {batchLimit}곡까지 가져올 수 있습니다.</p>}
              {!!allowed.length && <button type="button" className="text-sm text-indigo-700 underline dark:text-indigo-300"
                onClick={() => setSelected(chosen.length ? new Set() : new Set(allowed.slice(0, batchLimit).map(t => t.trackId)))}>
                {chosen.length ? '선택 해제' : allowed.length > batchLimit ? '앞에서 100곡 선택' : '전체 선택'}
              </button>}
            </>}
            <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-neutral-700 dark:border-neutral-700">
              {album.tracks.map(track => {
                const can = mayFill(track, props);
                const checked = selected.has(track.trackId);
                const result = results[track.trackId];
                const state = result ? statuses[result] : track.adult ? '열람 제한' : !can ? '기존 가사' : props.existingEmptyIds.has(track.id) ? '빈 슬롯' : '';
                return <li key={track.trackId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" checked={checked && can} disabled={!can || phase !== 'selecting' || (!checked && chosen.length >= batchLimit)}
                      onChange={() => setSelected(prev => { const next = new Set(prev); if (next.has(track.trackId)) next.delete(track.trackId); else next.add(track.trackId); return next; })}
                      className="size-4 shrink-0 accent-indigo-600" />
                    <span className="text-xs tabular-nums">{track.number}.</span><span className="break-words">{track.title}</span>
                  </label><span className="shrink-0 text-xs">{state}</span>
                </li>;
              })}
            </ol>
          </>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-4 dark:border-neutral-700">
          <button type="button" onClick={close} className="rounded-lg border px-3 py-2 text-sm">{phase === 'receiving' ? '가져오기 취소' : '닫기'}</button>
          {phase === 'failed' && opener && !opener.closed && !album && /^[a-f0-9]{32}$/.test(props.nonce) && <button type="button" onClick={reconnect}
            className="rounded-lg border px-3 py-2 text-sm">다시 연결</button>}
          {phase === 'selecting' && <button type="button" disabled={!chosen.length} onClick={begin}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">선택한 가사 {chosen.length}곡 가져와 저장</button>}
        </footer>
      </div>
    </dialog>
  );
}
