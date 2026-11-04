export interface OnlineLyricsQuery {
  title: string;
  artist: string;
  albumTitle?: string;
  alternateTitle?: string;
  alternateArtist?: string;
  alternateAlbumTitle?: string;
  duration?: number; // seconds
}

export type OnlineLyricsResult =
  | { status: 'found'; recordId: number; lyrics: string; sourceUrl: string }
  | { status: 'missing'; candidates?: LyricsCandidate[] }
  | { status: 'error'; message: string; retryAfter?: number };

export interface LyricsCandidate {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

type Alias = [originalTitle: string, alternateTitle: string, seconds: number, jointArtist?: string];
// Localized recording metadata, matched by album, track number and title. Sources:
// music.apple.com/us/album/liberation/1856835280 and music.bugs.co.kr/album/4091642
// musicbrainz.org/release/5772d3d6-18e4-4219-b60e-f23611ab06d3 and qobuz.com/us-en/album/rolling-stone-luci-gang/cir6b5w5xzfb1
const albums: Record<string, { name: string; tracks: Alias[] }> = {
  '4091642': { name: 'LIBERATION', tracks: [
    ['14-23', '14-23', 327], ['식사', 'PAC MAN', 195], ['OUTCOME', 'OUTCOME', 163],
    ['아버지', 'FATHER', 163], ['현주소', 'CURRENT ADDRESS', 213], ['XXK NEXT LEVEL', 'XXK NEXT LEVEL', 188],
    ['내 방에서 나가', 'KICK OUT', 204], ['파이트', 'FIGHT', 193], ['해방', 'LIBERATION', 213],
    ['공생', 'SYMBIOSIS', 218], ['진실', 'TRUTH', 191], ['욕심', 'GREED', 227],
  ] },
  '4151059': { name: 'Rolling Stone', tracks: [
    ['EASY A', 'EASY A', 166], ['YELLO TRAP', 'YELLO TRAP', 137], ['LEMON SQUEEZE', 'LEMON SQUEEZE', 93],
    ['빙글빙글', 'Cycles', 122], ['O n l y', 'O n l y', 127], ['어기여차', 'UHGIYEOCHA', 156],
    ['HEADLOCK', 'HEADLOCK', 118], ['WHPH', 'WHPH', 164], ['TYPE SHI', 'TYPE SHI', 155],
    ['너무 많은 것들', 'Too Many Things', 189], ['우비소녀 Remix', 'raincoat Remix', 177, 'Luci Gang Hyelyn Joo'],
    ['Outro (Skit)', 'Outro (Skit)', 36], ['Mama Just Got Home', 'Mama Just Got Home', 132],
  ] },
};

const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ');
const hangul = /\p{Script=Hangul}/u;
const latin = /\p{Script=Latin}/u;
const versionLabel = /\b(?:ver\.?|version|remix|mix|live|remaster(?:ed)?|acoustic|instrumental|inst|karaoke|feat(?:uring)?|ft\.?|edit|demo|intro|outro|skit|ost|bonus|english|korean|japanese)\b|버전|라이브|리믹스|어쿠스틱|인스트루멘탈|재녹음|피처링|영어판|한국어판/i;

function differentScripts(a: string, b: string) {
  return hangul.test(a) !== hangul.test(b) && latin.test(hangul.test(a) ? b : a);
}

// Catalogs and LRCLIB sometimes put the other official spelling in parentheses.
// Keep performance and language-edition qualifiers as part of the recording name.
function bilingualNames(value: string): string[] {
  const name = value.trim();
  const pair = name.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (!pair || !differentScripts(pair[1], pair[2]) || versionLabel.test(pair[1]) || versionLabel.test(pair[2])) return [name];
  return [name, pair[1].trim(), pair[2].trim()];
}
const withoutFeature = (s: string) => s.replace(/\s*\((?:feat(?:uring)?|ft)\.?\s+[^()]+\)\s*$/i, '').trim();

export function getAlbumTrackAliases(albumId: string, position: number, title: string): Partial<OnlineLyricsQuery> {
  const album = albums[albumId];
  const track = album?.tracks[position - 1];
  if (!track || normalize(track[0]) !== normalize(withoutFeature(title))) return {};
  return { alternateAlbumTitle: album.name, alternateTitle: track[1], duration: track[2], alternateArtist: track[3] };
}

interface RecordInfo {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental?: boolean;
  hasPlainLyrics?: boolean;
  hasSyncedLyrics?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function isRecord(value: unknown): value is RecordInfo {
  if (!value || typeof value !== 'object') return false;
  return 'id' in value && Number.isSafeInteger(value.id) && Number(value.id) > 0
    && 'trackName' in value && typeof value.trackName === 'string'
    && 'artistName' in value && typeof value.artistName === 'string'
    && 'albumName' in value && typeof value.albumName === 'string'
    && 'duration' in value && typeof value.duration === 'number';
}

const baseUrl = 'https://lrclib.net';
let nextRequest = 0;
let retryAt = 0;
// Share metadata-only searches between tracks; lyrics bodies are never cached here.
const albumSummaries = new Map<string, { expires: number; items: RecordInfo[] }>();

async function request(path: string, signal: AbortSignal) {
  if (retryAt > Date.now()) throw new Error('rate limit');
  const wait = nextRequest - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  const response = await fetch(baseUrl + path, {
    headers: { 'Lrclib-Client': 'LyricsSlotViewer/1 (https://github.com/Dobaisnotdobi/lyricstoolforHSH)' },
    credentials: 'omit', signal,
  });
  nextRequest = Date.now() + 250;
  if (response.status === 429) {
    const raw = response.headers.get('Retry-After');
    const delay = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw ?? '') - Date.now();
    retryAt = Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 60000) + Math.random() * 500;
    throw new Error('rate limit');
  }
  if (response.status === 404 && (path.startsWith('/api/get/') || path.startsWith('/api/get?'))) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function search(params: URLSearchParams, signal: AbortSignal): Promise<RecordInfo[]> {
  const rows = await request(`/api/v2/search?${params}`, signal);
  if (!Array.isArray(rows)) throw new Error('invalid search response');
  return rows.filter(isRecord);
}

async function searchRelease(term: string, signal: AbortSignal) {
  const key = normalize(term);
  const cached = albumSummaries.get(key);
  if (cached && cached.expires > Date.now()) return cached.items;
  const items = await search(new URLSearchParams({ q: term }), signal);
  if (albumSummaries.size >= 24) albumSummaries.delete(albumSummaries.keys().next().value);
  albumSummaries.set(key, { items, expires: Date.now() + 300000 });
  return items;
}

function plainText(record: RecordInfo) {
  if (typeof record.plainLyrics === 'string' && record.plainLyrics.trim()) return record.plainLyrics.trim();
  if (typeof record.syncedLyrics !== 'string') return '';
  return record.syncedLyrics.split(/\r?\n/)
    .filter(line => !/^\[(?:ar|al|ti|au|by|re|ve|length|offset):/i.test(line))
    .map(line => line.replace(/^(?:\[\d+:\d{2}(?:[.:]\d+)?\]\s*)+/, '').replace(/<\d+:\d{2}(?:[.:]\d+)?>/g, ''))
    .join('\n').trim();
}

async function withLyricsRequest(
  signal: AbortSignal | undefined,
  action: (activeSignal: AbortSignal) => Promise<OnlineLyricsResult>,
): Promise<OnlineLyricsResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 25000);
  try {
    return await action(controller.signal);
  } catch {
    const retryAfter = Math.ceil((retryAt - Date.now()) / 1000);
    if (retryAfter > 0) return { status: 'error', retryAfter, message: `LRCLIB 요청 한도에 도달했습니다. ${retryAfter}초 후 다시 시도해 주세요.` };
    if (signal?.aborted) return { status: 'error', message: '가사 검색을 중단했습니다.' };
    return { status: 'error', message: controller.signal.aborted ? 'LRCLIB 응답 시간이 초과되었습니다.' : 'LRCLIB 응답을 확인할 수 없습니다. 다시 시도해 주세요.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function fetchConfirmedLyrics(candidate: LyricsCandidate, signal?: AbortSignal): Promise<OnlineLyricsResult> {
  return withLyricsRequest(signal, async activeSignal => {
    if (!Number.isSafeInteger(candidate.id) || candidate.id < 1) return { status: 'missing' };
    const record = await request(`/api/get/${candidate.id}`, activeSignal);
    if (!isRecord(record) || record.instrumental || record.id !== candidate.id
      || normalize(record.trackName) !== normalize(candidate.title) || normalize(record.artistName) !== normalize(candidate.artist)
      || normalize(record.albumName) !== normalize(candidate.album) || Math.abs(record.duration - candidate.duration) > 1) {
      return { status: 'missing' };
    }
    const lyrics = plainText(record);
    return lyrics ? { status: 'found', recordId: record.id, lyrics, sourceUrl: `${baseUrl}/api/get/${record.id}` } : { status: 'missing' };
  });
}

export async function lookupOnlineLyrics(query: OnlineLyricsQuery, signal?: AbortSignal): Promise<OnlineLyricsResult> {
  if (!query.title.trim() || !query.artist.trim()) return { status: 'missing' };
  const titles = [...new Set([query.title, query.alternateTitle].filter(Boolean).flatMap(bilingualNames))];
  const artists = [...new Set([query.artist, query.alternateArtist].filter(Boolean).flatMap(bilingualNames))];
  const artistKeys = artists.map(normalize);
  const searchArtists = artists.filter(name => bilingualNames(name).length === 1);
  const albumNames = [...new Set([query.albumTitle, query.alternateAlbumTitle].filter(s => s && !/^앨범 \d+$/.test(s)).flatMap(bilingualNames))];
  const duration = query.duration;
  const strictRecording = duration > 0 && albumNames.length > 0;
  // Some storefronts append a release type to the same album title (e.g. "Her - EP").
  const albumKey = (name: string) => strictRecording ? normalize(name).replace(/\s+-\s+(?:ep|single)$/, '') : normalize(name);
  const titleKey = (s: string) => normalize(strictRecording ? withoutFeature(s) : s);
  const titleKeys = new Set(titles.map(titleKey));
  if (strictRecording && query.alternateTitle && differentScripts(query.title, query.alternateTitle)) {
    // Accept an unbracketed bilingual label only if both halves are already known.
    for (const [first, second] of [[query.title, query.alternateTitle], [query.alternateTitle, query.title]]) {
      for (const separator of [' ', ' / ', ' - ']) titleKeys.add(titleKey(first) + separator + titleKey(second));
    }
  }
  const sameRelease = (r: RecordInfo) => !r.instrumental
    && bilingualNames(r.artistName).some(s => artistKeys.includes(normalize(s)))
    && (!albumNames.length || bilingualNames(r.albumName).some(s => albumNames.some(name => albumKey(name) === albumKey(s))))
    && (!(duration > 0) || Math.abs(r.duration - duration) <= 2);
  const matches = (r: RecordInfo) => sameRelease(r)
    && (strictRecording ? bilingualNames(withoutFeature(r.trackName)) : [r.trackName])
      .some(name => titleKeys.has(titleKey(name)));
  const candidates = new Map<string, LyricsCandidate>();
  const missing = (): OnlineLyricsResult => candidates.size
    ? { status: 'missing', candidates: [...candidates.values()].sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration)).slice(0, 5) }
    : { status: 'missing' };
  return withLyricsRequest(signal, async activeSignal => {
    if (strictRecording && !query.alternateAlbumTitle && duration <= 3600) {
      const params = new URLSearchParams({
        artist_name: query.artist, track_name: query.title, album_name: query.albumTitle, duration: String(duration),
      });
      const record = await request(`/api/get?${params}`, activeSignal);
      if (isRecord(record) && matches(record)) {
        const lyrics = plainText(record);
        if (lyrics) return { status: 'found', recordId: record.id, lyrics, sourceUrl: `${baseUrl}/api/get/${record.id}` };
      }
    }
    async function getMatch(rows: RecordInfo[]): Promise<OnlineLyricsResult | undefined> {
      for (const r of rows) {
        if (strictRecording && sameRelease(r) && (r.hasPlainLyrics || r.hasSyncedLyrics)
          && !matches(r) && differentScripts(query.title, r.trackName)) {
          const key = [normalize(r.trackName), normalize(r.artistName), normalize(r.albumName), Math.round(r.duration)].join('\n');
          if (!candidates.has(key)) candidates.set(key, { id: r.id, title: r.trackName, artist: r.artistName, album: r.albumName, duration: r.duration });
        }
      }
      const matching = rows.filter(r => matches(r) && (r.hasPlainLyrics || r.hasSyncedLyrics));
      const exactTitle = (r: RecordInfo) => Number(normalize(r.trackName) === normalize(query.title));
      matching.sort((a, b) => exactTitle(b) - exactTitle(a)
        || (duration > 0 ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0));
      const best = matching[0];
      if (!best) return;
      if (!(duration > 0) && matching.some(r => normalize(r.albumName) !== normalize(best.albumName) || Math.abs(r.duration - best.duration) > 2)) return;
      const record = await request(`/api/get/${best.id}`, activeSignal);
      if (!record) return;
      if (!isRecord(record) || record.id !== best.id) throw new Error('invalid lyrics response');
      const lyrics = matches(record) && plainText(record);
      if (lyrics) return { status: 'found', recordId: best.id, lyrics, sourceUrl: `${baseUrl}/api/get/${best.id}` };
    }
    if (strictRecording) {
      const releaseNames = albumNames.filter(name => bilingualNames(name).length === 1);
      const terms = new Set(searchArtists.flatMap(artist => releaseNames.map(album => `${artist} ${album}`)));
      for (const term of terms) {
        const found = await getMatch(await searchRelease(term, activeSignal));
        if (found) return found;
      }
    }
    for (const artist of searchArtists) {
      for (const title of new Set(titles.map(withoutFeature))) {
        const params = new URLSearchParams({ artist_name: artist, track_name: title });
        const found = await getMatch(await search(params, activeSignal));
        if (found) return found;
      }
    }
    return missing();
  });
}
