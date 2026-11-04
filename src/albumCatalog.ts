import type { BugsTrack } from './bugsAlbum';

export interface CatalogAlbumHit {
  id: string;
  title: string;
  artist: string;
  url: string;
  trackCount: number;
  country: string;
  releaseDate?: string;
  preferKorean?: boolean;
  alternateAlbumTitle?: string;
  alternateArtist?: string;
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

async function request(path: 'search' | 'lookup', params: Record<string, string>, signal?: AbortSignal, timeoutMs = 30000): Promise<Row[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
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

const hasHangul = (s: string) => /[가-힣]/.test(s.normalize('NFKC'));
const nameKey = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function alternative(original: string, choices: string[]) {
  return choices.find(s => s && nameKey(s) !== nameKey(original));
}

function displayPair(primary: string, other: string | undefined, preferKorean: boolean): [string, string | undefined] {
  // A localized guest credit alone does not make the main title Korean.
  const main = (s: string) => s.replace(/\s*\((?:feat(?:uring)?|ft|with)\.?\s+[^()]*\)\s*$/i, '');
  return preferKorean && other && hasHangul(main(other)) && !hasHangul(main(primary))
    ? [other, primary] : [primary, other];
}

// Apple's KR album-with-songs lookup can be empty while a batch lookup by song ID
// returns localized titles for the same recordings. Never join the two lists by position.
async function localizedRows(ids: number[], country: string, signal?: AbortSignal, timeoutMs = 7000) {
  const rows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    try {
      rows.push(...await request('lookup', { id: ids.slice(offset, offset + 50).join(','), country }, signal, timeoutMs));
    } catch (error) {
      if (signal?.aborted) throw error;
      break; // Other storefronts may not carry the same releases.
    }
  }
  return rows;
}

async function localizeAlbum(album: CatalogAlbum, numberId: number, preferKorean: boolean, signal?: AbortSignal): Promise<CatalogAlbum> {
  const songs = new Map(album.tracks.map(track => [track.id, track]));
  const ids = album.tracks.map(track => Number(track.id.split(':').at(-1)));
  const albumNames: string[] = [];
  const artistNames: string[] = [];
  const countries = album.country === 'us' ? ['kr'] : ['kr', 'us'];
  for (const country of countries) {
    const rows = await localizedRows(ids, country, signal, 20000);
    for (const row of rows) {
      if (row.wrapperType !== 'track' || row.kind !== 'song' || row.collectionId !== numberId || !positiveInt(row.trackId)) continue;
      const track = songs.get(`apple:${numberId}:${row.trackId}`);
      if (!track) continue;
      track.alternateTitle ??= alternative(track.title, [label(row.trackName)]);
      track.alternateArtist ??= alternative(track.artist || album.artist, [label(row.artistName)]);
      albumNames.push(label(row.collectionName));
      if (track.artist === album.artist) artistNames.push(label(row.artistName));
    }
  }
  [album.title, album.alternateAlbumTitle] = displayPair(album.title,
    album.alternateAlbumTitle ?? alternative(album.title, albumNames), preferKorean);
  [album.artist, album.alternateArtist] = displayPair(album.artist,
    album.alternateArtist ?? alternative(album.artist, artistNames), preferKorean);
  for (const track of album.tracks) {
    [track.title, track.alternateTitle] = displayPair(track.title, track.alternateTitle, preferKorean);
    if (track.artist) [track.artist, track.alternateArtist] = displayPair(track.artist, track.alternateArtist, preferKorean);
  }
  return album;
}

export async function searchCatalogAlbums(query: string, signal?: AbortSignal, mode: 'album' | 'artist' = 'album'): Promise<CatalogAlbumHit[]> {
  const term = query.trim();
  if (!term) return [];
  const params = { term, media: 'music', entity: 'album', limit: mode === 'artist' ? '50' : '20' };
  const hits = new Map<string, CatalogAlbumHit>();
  const countries = ['us', 'kr'];
  const lookups = await Promise.allSettled(countries.map(country => request('search',
    mode === 'artist' ? { ...params, country, attribute: 'artistTerm' } : { ...params, country },
    signal, country === 'us' ? 30000 : 10000)));
  if (signal?.aborted) throw new DOMException('검색을 중단했습니다.', 'AbortError');
  let failure: unknown;
  for (const [index, result] of lookups.entries()) {
    if (result.status === 'rejected') {
      failure = result.reason;
      continue;
    }
    for (const row of result.value) {
      const hit = toHit(row, countries[index]);
      if (!hit) continue;
      const prior = hits.get(hit.id);
      if (prior) {
        prior.alternateAlbumTitle ??= alternative(prior.title, [hit.title]);
        prior.alternateArtist ??= alternative(prior.artist, [hit.artist]);
      } else hits.set(hit.id, hit);
    }
  }
  if (!hits.size && failure) throw failure;
  const preferKorean = hasHangul(term);
  if (hits.size && preferKorean) {
    const ids = [...hits.keys()].map(id => Number(id.slice(6)));
    for (const row of await localizedRows(ids, 'kr', signal)) {
      const local = toHit(row, 'kr');
      const match = local && hits.get(local.id);
      if (!match) continue;
      match.alternateAlbumTitle ??= alternative(match.title, [local.title]);
      match.alternateArtist ??= alternative(match.artist, [local.artist]);
    }
  }
  const results = [...hits.values()];
  for (const hit of results) {
    hit.preferKorean = preferKorean;
    [hit.title, hit.alternateAlbumTitle] = displayPair(hit.title, hit.alternateAlbumTitle, preferKorean);
    [hit.artist, hit.alternateArtist] = displayPair(hit.artist, hit.alternateArtist, preferKorean);
  }
  if (mode === 'album') {
    const key = nameKey(term);
    const rank = (hit: CatalogAlbumHit) => {
      const titles = [hit.title, hit.alternateAlbumTitle].filter(Boolean).map(nameKey);
      const artists = [hit.artist, hit.alternateArtist].filter(Boolean).map(nameKey);
      if (titles.some(t => artists.some(a => key === `${a} ${t}` || key === `${t} ${a}`))) return 2;
      return titles.includes(key) ? 1 : 0;
    };
    return results.sort((a, b) => rank(b) - rank(a));
  }
  // Let the user choose the release, even if several artists share this exact name.
  return results.filter(hit => [hit.artist, hit.alternateArtist].some(name => name && nameKey(name) === nameKey(term)));
}

export async function loadCatalogAlbum(input: CatalogAlbumHit | string, signal?: AbortSignal): Promise<CatalogAlbum> {
  const { country: requestedCountry, id } = readAlbumUrl(typeof input === 'string' ? input : input.url);
  const preferKorean = typeof input === 'string' ? requestedCountry === 'kr' : input.preferKorean === true;
  const countries = new Set([requestedCountry, 'us', 'kr']);
  let best: CatalogAlbum | undefined;
  let foundAlbum = false;
  for (const country of countries) {
    let rows: Row[];
    try {
      rows = await request('lookup', { id: String(id), country, entity: 'song', limit: '200' }, signal);
    } catch (error) {
      if (best && !signal?.aborted) return localizeAlbum(best, id, preferKorean, signal);
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
    if (typeof input !== 'string' && input.id === hit.id) {
      album.alternateAlbumTitle = alternative(hit.title, [input.title, input.alternateAlbumTitle || '']);
      album.alternateArtist = alternative(hit.artist, [input.artist, input.alternateArtist || '']);
    }
    if (tracks.length === hit.trackCount) return localizeAlbum(album, id, preferKorean, signal);
    if (tracks.length > (best?.tracks.length ?? 0)) best = album;
  }
  if (best) return localizeAlbum(best, id, preferKorean, signal);
  throw new Error(foundAlbum ? 'Apple Music에서 이 앨범의 수록곡을 확인할 수 없습니다.' : 'Apple Music 카탈로그에서 이 앨범을 찾을 수 없습니다.');
}
