import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import {
  getBugsSample, normalizeBugsAlbumUrl, parseBugsTracklist,
  type BugsAlbum, type BugsTrack,
} from './bugsAlbum';

interface Props {
  existingIds: ReadonlySet<string>;
  onImport: (tracks: BugsTrack[]) => void;
  onClose: () => void;
}

const SAMPLE_URL = 'https://music.bugs.co.kr/album/4091642?wl_ref=list_ab_01';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 focus-visible:outline-indigo-500';
const secondary = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800';
const primary = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';

export default function BugsImportDialog({ existingIds, onImport, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [album, setAlbum] = useState<BugsAlbum | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const available = album?.tracks.filter(track => !existingIds.has(track.id)) ?? [];
  const selected = available.filter(track => !unchecked.has(track.id));

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  function resetUrl(value: string) {
    setUrl(value);
    setPasteUrl('');
    setText('');
    setHtml('');
    setAlbum(null);
    setUnchecked(new Set());
    setError('');
  }

  function openAlbum(input: string) {
    resetUrl(input);
    try {
      const normalized = normalizeBugsAlbumUrl(input);
      const sample = getBugsSample(normalized.url);
      if (sample) setAlbum(sample);
      else setPasteUrl(normalized.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '앨범 주소를 확인해 주세요.');
    }
  }

  function updateTracklist(value: string, table = '') {
    setText(value);
    setHtml(table);
    setAlbum(null);
    setError('');
  }

  function previewTracklist() {
    try {
      setAlbum(parseBugsTracklist(pasteUrl, text, html));
      setUnchecked(new Set());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '수록곡 목록을 확인해 주세요.');
    }
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
            <h2 id="bugs-heading" className="text-lg font-bold">벅스 가져오기 <span className="text-xs text-indigo-600 dark:text-indigo-300">DEMO</span></h2>
            <p id="bugs-description" className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
              선택한 곡 제목으로 새 슬롯을 만듭니다. 가사는 가져온 뒤 수정 모드에서 입력하거나 TXT로 올려 주세요.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-neutral-800"><X size={18} /></button>
        </header>

        <div className="custom-scrollbar space-y-4 overflow-y-auto p-4">
          <form className="space-y-2" onSubmit={event => { event.preventDefault(); openAlbum(url); }}>
            <label htmlFor="bugs-url" className="text-sm font-semibold">벅스 앨범 주소</label>
            <input id="bugs-url" type="text" inputMode="url" autoFocus autoComplete="off" spellCheck={false} value={url}
              onChange={event => resetUrl(event.target.value)} placeholder="https://music.bugs.co.kr/album/…" className={field} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={secondary}>수록곡 확인</button>
              <button type="button" onClick={() => openAlbum(SAMPLE_URL)} className="py-1 text-sm text-indigo-700 underline underline-offset-2 dark:text-indigo-300">《해방》 예시 열기</button>
            </div>
          </form>

          {pasteUrl && (
            <section className="space-y-2">
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
              <button type="button" className={secondary} onClick={previewTracklist}>목록 미리보기</button>
            </section>
          )}

          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          {album && (
            <section aria-label="가져올 수록곡" className="space-y-2">
              <h3 className="font-semibold">{album.title}{album.artist && <span className="ml-2 text-sm font-normal">{album.artist}</span>}</h3>
              <p className="text-xs text-slate-600 dark:text-neutral-300">
                {album.source === 'sample' ? '데모에 저장된 예시 앨범' : '붙여넣은 수록곡 목록'} · {album.tracks.length}곡
              </p>
              {album.source === 'sample' && <button type="button"
                onClick={() => { setPasteUrl(album.url); setAlbum(null); }}
                className="block text-xs font-medium text-indigo-700 underline dark:text-indigo-300">
                벅스에서 복사한 목록으로 확인
              </button>}
              {!!available.length && <button type="button" className="py-1 text-xs font-medium text-indigo-700 underline dark:text-indigo-300"
                onClick={() => setUnchecked(selected.length === available.length ? new Set(available.map(track => track.id)) : new Set())}>
                {selected.length === available.length ? '전체 선택 해제' : '전체 선택'}
              </button>}
              <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-neutral-700 dark:border-neutral-700">
                {album.tracks.map(track => {
                  const exists = existingIds.has(track.id);
                  return (
                    <li key={track.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="checkbox" disabled={exists} checked={!exists && !unchecked.has(track.id)}
                          onChange={() => toggle(track.id)} className="size-4 shrink-0 accent-indigo-600" />
                        <span className="text-xs tabular-nums text-slate-500 dark:text-neutral-400">{track.number}.</span>
                        <span className="break-words">{track.title}</span>
                      </label>
                      {exists && <span className="text-xs text-slate-600 dark:text-neutral-400">추가됨</span>}
                      {track.adult && <span className="whitespace-nowrap text-xs text-red-700 dark:text-red-300">19금</span>}
                      {track.url && <a href={track.url} target="_blank" rel="noreferrer" aria-label={`${track.title} 벅스 곡정보 (새 탭)`}
                        className="rounded p-1 text-indigo-700 dark:text-indigo-300"><ExternalLink size={14} /></a>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 dark:border-neutral-700">
          <span role="status" className="mr-auto text-xs text-slate-600 dark:text-neutral-300">{album && (available.length ? `${selected.length}곡 선택` : '모두 추가된 곡입니다.')}</span>
          <button type="button" className={secondary} onClick={onClose}>취소</button>
          <button type="button" disabled={!selected.length} className={primary} onClick={() => onImport(selected)}>슬롯에 추가</button>
        </footer>
      </div>
    </dialog>
  );
}
