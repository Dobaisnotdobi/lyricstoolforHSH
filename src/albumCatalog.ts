import type { BugsTrack } from './bugsAlbum';

export interface CatalogAlbumHit {
  id: string;
  title: string;
  artist: string;
  url: string;
  trackCount: number;
  country: string;
  releaseDate?: string;
}

export interface CatalogAlbum extends CatalogAlbumHit {
  source: 'apple';
  tracks: BugsTrack[];
}

type Row = Record<string, unknown>;
const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const label = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const albumUrl = (country: string, id: number) => `https://music.apple.com/${country}/album/${id}`;

function readAlbumUrl(input: string) {
  const invalid = 'Apple Music 앨범 주소를 입력해 주세요.';
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error(invalid); }
  if (url.protocol !== 'https:' || !['music.apple.com', 'itunes.apple.com'].includes(url.hostname)
    || url.username || url.password || url.port) throw new Error(invalid);
  const path = /^\/(?:([a-z]{2})\/)?album\/(?:[^/]+\/)?(?:id)?([1-9]\d*)\/?$/i.exec(url.pathname);
  if (!path || !positiveInt(Number(path[2]))) throw new Error(invalid);
  return { country: path[1]?.toLowerCase() || 'us', id: Number(path[2]) };
}

async function request(path: 'search' | 'lookup', params: Record<string, string>, signal?: AbortSignal): Promise<Row[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(`https://itunes.apple.com/${path}?${new URLSearchParams(params)}`, {
      signal: controller.signal, credentials: 'omit',
    });
    if (response.status === 429) throw new Error('Apple Music 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.');
    if (!response.ok) throw new Error(`Apple Music 카탈로그 요청에 실패했습니다 (HTTP ${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data?.results) || !data.results.every((r: unknown) => r && typeof r === 'object')) {
      throw new Error('Apple Music 카탈로그 응답을 읽을 수 없습니다.');
    }
    return data.results;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('검색을 중단했습니다.', 'AbortError');
    if (controller.signal.aborted) throw new Error('Apple Music 응답 시간이 초과되었습니다. 다시 시도해 주세요.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Apple Music 카탈로그에 연결할 수 없습니다. 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function toHit(row: Row, country: string): CatalogAlbumHit | undefined {
  if (row.wrapperType !== 'collection' || row.collectionType !== 'Album' || !positiveInt(row.collectionId)
    || !positiveInt(row.trackCount) || !label(row.collectionName) || !label(row.artistName)) return;
  const releaseDate = label(row.releaseDate).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return {
    id: `apple:${row.collectionId}`, title: label(row.collectionName), artist: label(row.artistName),
    url: albumUrl(country, row.collectionId), country, trackCount: row.trackCount, releaseDate,
  };
}

export async function searchCatalogAlbums(query: string, signal?: AbortSignal): Promise<CatalogAlbumHit[]> {
  const term = query.trim();
  if (!term) return [];
  for (const country of ['us', 'kr']) {
    const rows = await request('search', { term, country, media: 'music', entity: 'album', limit: '20' }, signal);
    const hits = new Map<string, CatalogAlbumHit>();
    for (const row of rows) {
      const hit = toHit(row, country);
      if (hit && !hits.has(hit.id)) hits.set(hit.id, hit);
    }
    if (hits.size) return [...hits.values()];
  }
  return [];
}

export async function loadCatalogAlbum(input: CatalogAlbumHit | string, signal?: AbortSignal): Promise<CatalogAlbum> {
  const { country: requestedCountry, id } = readAlbumUrl(typeof input === 'string' ? input : input.url);
  const countries = new Set([requestedCountry, 'us', 'kr']);
  let best: CatalogAlbum | undefined;
  let foundAlbum = false;
  for (const country of countries) {
    let rows: Row[];
    try {
      rows = await request('lookup', { id: String(id), country, entity: 'song', limit: '200' }, signal);
    } catch (error) {
      if (best && !signal?.aborted) return best;
      throw error;
    }
    const header = rows.find(row => row.wrapperType === 'collection' && row.collectionId === id);
    const hit = header && toHit(header, country);
    if (!hit) continue;
    foundAlbum = true;
    const tracks: BugsTrack[] = [];
    const ids = new Set<number>();
    // Track numbers restart on each disc. Expose album-wide positions to the slot importer.
    const songs = rows.filter(r => r.wrapperType === 'track' && r.kind === 'song' && r.collectionId === id)
      .sort((a, b) => Number(a.discNumber ?? 1) - Number(b.discNumber ?? 1) || Number(a.trackNumber) - Number(b.trackNumber));
    for (const row of songs) {
      if (!positiveInt(row.trackId) || ids.has(row.trackId) || !positiveInt(row.trackNumber) || !label(row.trackName)) continue;
      ids.add(row.trackId);
      tracks.push({
        id: `apple:${id}:${row.trackId}`, number: tracks.length + 1, title: label(row.trackName), artist: label(row.artistName) || hit.artist,
        url: `${hit.url}?i=${row.trackId}`, adult: row.trackExplicitness === 'explicit',
        duration: positiveInt(row.trackTimeMillis) ? Math.round(row.trackTimeMillis / 1000) : undefined,
      });
    }
    const album: CatalogAlbum = { ...hit, source: 'apple', tracks };
    if (tracks.length === hit.trackCount) return album;
    if (tracks.length > (best?.tracks.length ?? 0)) best = album;
  }
  if (best) return best;
  throw new Error(foundAlbum ? 'Apple Music에서 이 앨범의 수록곡을 확인할 수 없습니다.' : 'Apple Music 카탈로그에서 이 앨범을 찾을 수 없습니다.');
}
