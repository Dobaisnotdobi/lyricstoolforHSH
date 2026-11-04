import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import OnlineLyricsPanel from './OnlineLyricsPanel';
import CatalogAlbumPicker from './CatalogAlbumPicker';
import {
  getBugsSample, normalizeBugsAlbumUrl, parseBugsTracklist,
  type BugsAlbum, type BugsTrack,
} from './bugsAlbum';

interface Props {
  existingIds: ReadonlySet<string>;
  existingEmptyIds: ReadonlySet<string>;
  onImport: (tracks: (BugsTrack & {lyrics?: string})[]) => void;
  onClose: () => void;
}

const SAMPLE_URL = 'https://music.bugs.co.kr/album/4091642?wl_ref=list_ab_01';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 focus-visible:outline-indigo-500';
const secondary = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800';
const primary = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';

export default function BugsImportDialog({ existingIds, existingEmptyIds, onImport, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'catalog' | 'bugs'>('catalog');
  const [url, setUrl] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [text, setText] = useState('');
  const [online, setOnline] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [fileNote, setFileNote] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const revision = useRef(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [album, setAlbum] = useState<BugsAlbum | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const lyrics = { ...online, ...files };
  const available = album?.tracks.filter(track => !existingIds.has(track.id) || (existingEmptyIds.has(track.id) && !!lyrics[track.id])) ?? [];
  const selected = available.filter(track => !unchecked.has(track.id));
  const withLyrics = selected.filter(track => !!lyrics[track.id]);
  const busy = lookingUp || readingFiles;

  function clearLyrics() {
    revision.current++;
    setPreviewKey(n => n + 1);
    setOnline({});
    setFiles({});
    setFileNote('');
    setReadingFiles(false);
    setLookingUp(false);
  }


  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  function resetUrl(value: string) {
    setUrl(value);
    setPasteUrl('');
    setText('');
    clearLyrics();
    setAlbum(null);
    setUnchecked(new Set());
    setError('');
  }

  function openAlbum(input: string) {
    resetUrl(input);
    setMode('bugs');
    try {
      const normalized = normalizeBugsAlbumUrl(input);
      const sample = getBugsSample(normalized.url);
      if (sample) setAlbum(sample);
      else setPasteUrl(normalized.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '앨범 주소를 확인해 주세요.');
    }
  }

  function changeMode(next: typeof mode) {
    if (mode === next) return;
    resetUrl('');
    setMode(next);
  }

  function updateTracklist(value: string, table = '') {
    setText(value);
    clearLyrics();
    setError('');
    setUnchecked(new Set());
    if (!value.trim() && !table) { setAlbum(null); return; }
    try {
      setAlbum(parseBugsTracklist(pasteUrl, value, table));
    } catch (e) {
      setAlbum(null);
      setError(e instanceof Error ? e.message : '수록곡 목록을 확인해 주세요.');
    }
  }

  async function readFiles(input: FileList | null) {
    if (!input?.length || !album) return;
    const normalize = (name: string) => name.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
    const generation = revision.current;
    const result: Record<string, string> = {};
    const chosen = Array.from(input);
    const names = chosen.map(file => normalize(file.name.replace(/\.txt$/i, '')));
    setReadingFiles(true);
    for (const [i, file] of chosen.entries()) {
      const matches = album.tracks.filter(t => normalize(t.title) === names[i]);
      if (!/\.txt$/i.test(file.name) || names.indexOf(names[i]) !== names.lastIndexOf(names[i]) || matches.length !== 1) continue;
      const track = matches[0];
      if (existingIds.has(track.id) && !existingEmptyIds.has(track.id)) continue;
      try {
        const contents = await file.text();
        if (generation !== revision.current) return;
        if (contents.trim()) result[track.id] = contents;
      } catch { /* Unreadable files are included in the skipped count. */ }
    }
    if (generation !== revision.current) return;
    setFiles(result);
    const count = Object.keys(result).length;
    setFileNote(`가사 파일 연결 ${count}곡 · 건너뜀 ${chosen.length - count}개`);
    setReadingFiles(false);
  }

  function toggle(id: string) {
    setUnchecked(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <dialog ref={dialog} aria-labelledby="bugs-heading" aria-describedby="bugs-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation(); }}
      className="ui-chrome m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/45 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex max-h-[86dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-neutral-700">
          <div>
            <h2 id="bugs-heading" className="text-lg font-bold">앨범 가사 가져오기</h2>
            <p id="bugs-description" className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
              앨범을 열고 온라인 가사를 조회하세요. 찾은 가사는 새 슬롯이나 기존 빈 슬롯에 넣을 수 있습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-neutral-800"><X size={18} /></button>
        </header>

        <div className="custom-scrollbar space-y-4 overflow-y-auto p-4">
          <div role="group" aria-label="앨범 찾기 방법" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-neutral-800">
            <button type="button" aria-pressed={mode === 'catalog'} onClick={() => changeMode('catalog')}
              className="rounded-md px-3 py-1.5 aria-pressed:bg-white aria-pressed:font-semibold aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-950">앨범 검색·링크</button>
            <button type="button" aria-pressed={mode === 'bugs'} onClick={() => changeMode('bugs')}
              className="rounded-md px-3 py-1.5 aria-pressed:bg-white aria-pressed:font-semibold aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-950">벅스 주소</button>
          </div>
          {mode === 'catalog' ? (
            <CatalogAlbumPicker onAlbum={setAlbum} onReset={() => resetUrl('')} onBugsUrl={openAlbum} />
          ) : (
          <form className="space-y-2" onSubmit={event => { event.preventDefault(); openAlbum(url); }}>
            <label htmlFor="bugs-url" className="text-sm font-semibold">벅스 앨범 주소</label>
            <input id="bugs-url" type="text" inputMode="url" autoFocus autoComplete="off" spellCheck={false} value={url}
              onChange={event => resetUrl(event.target.value)} placeholder="https://music.bugs.co.kr/album/…" className={field} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={secondary}>수록곡 확인</button>
              <button type="button" onClick={() => openAlbum(SAMPLE_URL)} className="py-1 text-sm text-indigo-700 underline underline-offset-2 dark:text-indigo-300">《해방》 예시 열기</button>
            </div>
          </form>
          )}

          {pasteUrl && (
            <section className="space-y-2">
              <p className="text-sm leading-relaxed">이 벅스 주소에서 곡 목록을 바로 읽을 수 없습니다. <button type="button" onClick={() => changeMode('catalog')} className="font-semibold text-indigo-700 underline dark:text-indigo-300">앨범 이름으로 검색</button>하거나 아래에 수록곡 표를 붙여넣으세요.</p>
              <label htmlFor="bugs-list" className="text-sm font-semibold">수록곡 목록 붙여넣기</label>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-neutral-300">
                <a href={pasteUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline dark:text-indigo-300">벅스 앨범 페이지 열기 ↗</a>
                {' '}후 수록곡 표를 복사해 붙여넣으세요. 곡 제목을 한 줄에 하나씩 입력해도 됩니다.
              </p>
              <textarea id="bugs-list" rows={4} value={text} className={field}
                onChange={event => updateTracklist(event.target.value)}
                onPaste={event => {
                  const input = event.currentTarget;
                  const table = event.clipboardData.getData('text/html');
                  const plain = event.clipboardData.getData('text/plain');
                  if (table && plain && input.selectionStart === 0 && input.selectionEnd === input.value.length) {
                    event.preventDefault();
                    updateTracklist(plain, table);
                  }
                }} />
              <p className="text-xs text-slate-500 dark:text-neutral-400">표를 붙여넣으면 곡 목록이 바로 표시됩니다.</p>
            </section>
          )}

          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          {album && (
            <section aria-label="가져올 수록곡" className="space-y-2">
              <h3 className="font-semibold">{album.title}{album.artist && <span className="ml-2 text-sm font-normal">{album.artist}</span>}</h3>
              <p className="text-xs text-slate-600 dark:text-neutral-300">
                {album.source === 'apple' ? 'Apple Music 수록곡' : album.source === 'sample' ? '저장된 벅스 예시 목록' : '붙여넣은 수록곡 목록'} · {album.tracks.length}곡
              </p>
              {album.source === 'sample' && <button type="button"
                onClick={() => { setPasteUrl(album.url); setAlbum(null); clearLyrics(); }}
                className="block text-xs font-medium text-indigo-700 underline dark:text-indigo-300">
                벅스에서 복사한 목록으로 확인
              </button>}
              <div key={previewKey}>
                <OnlineLyricsPanel album={album} existingIds={existingIds} existingEmptyIds={existingEmptyIds}
                  onResults={setOnline} onBusyChange={setLookingUp} />
              </div>
              <details className="text-xs text-slate-600 dark:text-neutral-300">
                <summary className="cursor-pointer py-1">곡별 가사 TXT 선택</summary>
                <p className="py-1">곡 제목과 같은 이름의 UTF-8 TXT 파일을 선택하세요. 이미 가사가 있는 슬롯은 보존합니다.</p>
                <input type="file" multiple accept=".txt,text/plain" aria-label="곡별 가사 TXT 선택" disabled={busy}
                  onChange={e => { void readFiles(e.target.files); e.target.value = ''; }} />
                {fileNote && <p role="status">{fileNote}</p>}
              </details>
              {!!available.length && <button type="button" className="py-1 text-xs font-medium text-indigo-700 underline dark:text-indigo-300"
                onClick={() => setUnchecked(selected.length === available.length ? new Set(available.map(track => track.id)) : new Set())}>
                {selected.length === available.length ? '전체 선택 해제' : '전체 선택'}
              </button>}
              <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-neutral-700 dark:border-neutral-700">
                {album.tracks.map(track => {
                  const exists = existingIds.has(track.id);
                  const canSelect = !exists || (existingEmptyIds.has(track.id) && !!lyrics[track.id]);
                  return (
                    <li key={track.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="checkbox" disabled={!canSelect} checked={canSelect && !unchecked.has(track.id)}
                          onChange={() => toggle(track.id)} className="size-4 shrink-0 accent-indigo-600" />
                        <span className="text-xs tabular-nums text-slate-500 dark:text-neutral-400">{track.number}.</span>
                        <span className="break-words">{track.title}</span>
                      </label>
                      <span className="text-xs text-slate-600 dark:text-neutral-400">{files[track.id] ? 'TXT 가사' : online[track.id] ? '온라인 가사' : exists ? (existingEmptyIds.has(track.id) ? '빈 슬롯' : '기존 가사') : ''}</span>
                      {track.adult && <span className="whitespace-nowrap text-xs text-red-700 dark:text-red-300">19금</span>}
                      {track.url && <a href={track.url} target="_blank" rel="noreferrer" aria-label={`${track.title} 곡 정보 (새 탭)`}
                        className="rounded p-1 text-indigo-700 dark:text-indigo-300"><ExternalLink size={14} /></a>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 dark:border-neutral-700">
          <span role="status" className="mr-auto text-xs text-slate-600 dark:text-neutral-300">{album ? (withLyrics.length ? `가사 ${withLyrics.length}곡 저장 가능` : '온라인 조회 또는 TXT로 가사를 불러오세요.') : (pasteUrl ? '앨범을 검색하거나 수록곡 표를 붙여넣어 주세요.' : '먼저 앨범을 선택해 주세요.')}</span>
          <button type="button" className={secondary} onClick={onClose}>취소</button>
          {withLyrics.length ? <button type="button" disabled={busy} className={primary}
            onClick={() => onImport(withLyrics.map(t => ({ ...t, lyrics: lyrics[t.id] })))}>가사 {withLyrics.length}곡 저장</button>
            : <button type="button" disabled={busy || !selected.length} className={primary}
              onClick={() => onImport(selected)}>제목만 추가</button>}
        </footer>
      </div>
    </dialog>
  );
}
