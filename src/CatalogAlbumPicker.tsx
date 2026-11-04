import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { loadCatalogAlbum, searchCatalogAlbums, type CatalogAlbumHit } from './albumCatalog';
import type { BugsAlbum } from './bugsAlbum';

interface Props {
  onAlbum: (album: BugsAlbum) => void;
  onReset: () => void;
  onBugsUrl?: (url: string) => void;
}

export default function CatalogAlbumPicker({ onAlbum, onReset, onBugsUrl }: Props) {
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'album' | 'artist'>('album');
  const [hits, setHits] = useState<CatalogAlbumHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isUrl = /^https?:\/\//i.test(query.trim());

  useEffect(() => () => request.current?.abort(), []);

  function reset() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError('');
    setStatus('');
    onReset();
  }

  function changeSearchBy(mode: typeof searchBy) {
    reset();
    setHits([]);
    setSearchBy(mode);
    input.current?.focus();
    input.current?.select();
  }

  async function submit(hit?: CatalogAlbumHit) {
    const value = query.trim();
    if (!value) return;
    reset();
    if (!hit) setHits([]);
    if (!hit && onBugsUrl && /^https:\/\/music\.bugs\.co\.kr\/album\/\d+\/?(?:[?#].*)?$/i.test(value)) {
      onBugsUrl(value);
      return;
    }
    const job = new AbortController();
    request.current = job;
    setBusy(true);
    try {
      if (hit || isUrl) {
        setStatus('수록곡을 불러오는 중…');
        const album = await loadCatalogAlbum(hit || value, job.signal);
        if (job.signal.aborted) return;
        onAlbum(album);
        const count = album.tracks.length;
        setStatus(count < album.trackCount
          ? `《${album.title}》 전체 ${album.trackCount}곡 중 ${count}곡을 불러왔습니다.`
          : `《${album.title}》 수록곡 ${count}곡을 불러왔습니다.`);
        setHits([]);
      } else {
        setStatus('앨범을 검색하는 중…');
        const matches = await searchCatalogAlbums(value, job.signal, searchBy);
        if (job.signal.aborted) return;
        setHits(matches);
        setStatus(matches.length
          ? `${searchBy === 'artist' ? '아티스트 발매 목록' : '검색 결과'} ${matches.length}개 · 원하는 앨범을 선택하세요.`
          : searchBy === 'artist' ? '일치하는 발매 목록이 없습니다. 아티스트의 다른 공식 표기도 확인해 주세요.'
          : '일치하는 앨범이 없습니다. 번역 제목을 모르면 아티스트별 앨범에서 찾아보세요.');
      }
    } catch (e) {
      if (job.signal.aborted) return;
      setStatus('');
      setError(e instanceof Error ? e.message : '요청을 완료하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (request.current === job) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section aria-label="앨범 검색" className="space-y-2">
      <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="catalog-query" className="text-sm font-semibold">{searchBy === 'artist' ? '아티스트 이름' : '앨범 검색'}</label>
          <select aria-label="검색 기준" value={searchBy} onChange={e => changeSearchBy(e.target.value === 'artist' ? 'artist' : 'album')}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950">
            <option value="album">앨범명·키워드</option>
            <option value="artist">아티스트별 앨범</option>
          </select>
        </div>
        <p id="catalog-help" className="text-xs leading-relaxed text-slate-600 dark:text-neutral-300">
          {searchBy === 'artist' ? '아티스트 이름만 입력하세요. 발매 목록에서 제목과 발매일을 보고 앨범을 선택할 수 있습니다.'
            : `아티스트·앨범명 또는 ${onBugsUrl ? 'Apple Music·벅스' : 'Apple Music'} 앨범 링크를 입력하세요. Apple Music 앨범을 열면 가사를 자동으로 찾습니다.`}
        </p>
        <div className="flex items-stretch gap-2">
          <input ref={input} id="catalog-query" type="text" autoFocus autoComplete="off" spellCheck={false}
            aria-describedby="catalog-help" value={query} placeholder={searchBy === 'artist' ? '예: 검정치마' : '아티스트, 앨범 이름 또는 앨범 링크'}
            onChange={event => { reset(); setQuery(event.target.value); setHits([]); }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-indigo-500 dark:border-neutral-700 dark:bg-neutral-950" />
          <button type="submit" disabled={busy || !query.trim()}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? <LoaderCircle aria-hidden="true" size={15} className="motion-safe:animate-spin" /> : <Search aria-hidden="true" size={15} />}
            {isUrl ? '앨범 열기' : '검색'}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-600 dark:text-neutral-300">
        <span role="status">{status}</span>
        {busy && <button type="button" className="py-1 text-indigo-700 underline dark:text-indigo-300"
          onClick={() => { reset(); setStatus('요청을 취소했습니다.'); }}>요청 취소</button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      {hits.length > 0 && (
        <ul aria-label="앨범 검색 결과" className="custom-scrollbar max-h-60 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 dark:divide-neutral-700 dark:border-neutral-700">
          {hits.map(hit => (
            <li key={hit.id}>
              <button type="button" disabled={busy} onClick={() => void submit(hit)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500 disabled:opacity-60 dark:hover:bg-neutral-800">
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold">{hit.title}</span>
                  {hit.alternateAlbumTitle && <span className="block text-xs">{hit.alternateAlbumTitle}</span>}
                  <span className="block break-words text-xs text-slate-600 dark:text-neutral-300">
                    {[hit.artist, hit.alternateArtist, hit.releaseDate, `${hit.trackCount}곡`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-indigo-600 dark:text-indigo-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
