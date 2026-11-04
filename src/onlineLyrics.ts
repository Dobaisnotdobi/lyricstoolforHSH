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
  | { status: 'found'; lyrics: string; sourceUrl: string }
  | { status: 'missing' }
  | { status: 'error'; message: string; retryAfter?: number };

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

const normalize = (s: string) => s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
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

function artistNames(name: string) {
  const bilingual = name.trim().match(/^([가-힣\s]+)\s*\(([a-zA-Z][^()]*)\)$/);
  return bilingual ? [bilingual[2].trim(), bilingual[1].trim()] : [name.trim()];
}

const baseUrl = 'https://lrclib.net';
let nextRequest = 0;
let retryAt = 0;
// Only lightweight search summaries are cached during an album import.
let albumSummaries: { key: string; expires: number; items: RecordInfo[]; complete: boolean } | undefined;

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
  if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error('invalid search response');
  return rows;
}

function plainText(record: RecordInfo) {
  if (typeof record.plainLyrics === 'string' && record.plainLyrics.trim()) return record.plainLyrics.trim();
  if (typeof record.syncedLyrics !== 'string') return '';
  return record.syncedLyrics.split(/\r?\n/)
    .filter(line => !/^\[(?:ar|al|ti|au|by|re|ve|length|offset):/i.test(line))
    .map(line => line.replace(/^(?:\[\d+:\d{2}(?:[.:]\d+)?\]\s*)+/, '').replace(/<\d+:\d{2}(?:[.:]\d+)?>/g, ''))
    .join('\n').trim();
}

export async function lookupOnlineLyrics(query: OnlineLyricsQuery, signal?: AbortSignal): Promise<OnlineLyricsResult> {
  if (!query.title.trim() || !query.artist.trim()) return { status: 'missing' };
  const titles = [...new Set([query.alternateTitle, query.title].filter(Boolean) as string[])];
  const artists = artistNames(query.artist);
  const artistKeys = [...artists, query.alternateArtist].filter(Boolean).map(normalize);
  const albumNames = [query.albumTitle, query.alternateAlbumTitle].filter(s => s && !/^앨범 \d+$/.test(s)).map(normalize);
  const duration = query.duration;
  const strictRecording = duration > 0 && albumNames.length > 0;
  // Some storefronts append a release type to the same album title (e.g. "Her - EP").
  const albumKey = (name: string) => strictRecording ? normalize(name).replace(/\s+-\s+(?:ep|single)$/, '') : normalize(name);
  const titleKey = (s: string) => normalize(strictRecording ? withoutFeature(s) : s);
  const matches = (r: RecordInfo) => !r.instrumental
    && artistKeys.includes(normalize(r.artistName))
    && titles.some(t => titleKey(t) === titleKey(r.trackName))
    && (!albumNames.length || albumNames.some(name => albumKey(name) === albumKey(r.albumName)))
    && (!(duration > 0) || Math.abs(r.duration - duration) <= 2);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 25000);
  try {
    if (strictRecording && !query.alternateAlbumTitle && duration <= 3600) {
      const params = new URLSearchParams({
        artist_name: query.artist, track_name: query.title, album_name: query.albumTitle, duration: String(duration),
      });
      const record = await request(`/api/get?${params}`, controller.signal);
      if (isRecord(record) && matches(record)) {
        const lyrics = plainText(record);
        if (lyrics) return { status: 'found', lyrics, sourceUrl: `${baseUrl}/api/get/${record.id}` };
      }
    }
    async function getMatch(rows: RecordInfo[]): Promise<OnlineLyricsResult | undefined> {
      const matching = rows.filter(r => matches(r) && (r.hasPlainLyrics || r.hasSyncedLyrics));
      const exactTitle = (r: RecordInfo) => Number(normalize(r.trackName) === normalize(query.title));
      matching.sort((a, b) => exactTitle(b) - exactTitle(a)
        || (duration > 0 ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0));
      const best = matching[0];
      if (!best) return;
      if (!(duration > 0) && matching.some(r => normalize(r.albumName) !== normalize(best.albumName) || Math.abs(r.duration - best.duration) > 2)) return;
      const record = await request(`/api/get/${best.id}`, controller.signal);
      if (!record) return;
      if (!isRecord(record) || record.id !== best.id) throw new Error('invalid lyrics response');
      const lyrics = matches(record) && plainText(record);
      if (lyrics) return { status: 'found', lyrics, sourceUrl: `${baseUrl}/api/get/${best.id}` };
    }
    if (strictRecording && query.alternateAlbumTitle) {
      const terms = artists.flatMap(a => [...new Set([query.alternateAlbumTitle, query.albumTitle].filter(Boolean))].map(b => `${a} ${b}`));
      const key = JSON.stringify(terms);
      if (albumSummaries?.key !== key || albumSummaries.expires <= Date.now()) {
        const items: RecordInfo[] = [];
        let complete = true;
        for (const q of terms) {
          const rows = await search(new URLSearchParams({ q }), controller.signal);
          items.push(...rows);
          if (rows.length === 20) complete = false; // LRCLIB caps an individual search at 20.
        }
        albumSummaries = { key, items, complete, expires: Date.now() + 300000 };
      }
      const found = await getMatch(albumSummaries.items);
      if (found) return found;
      if (albumSummaries.complete && albumSummaries.items.length) return { status: 'missing' };
    }
    for (const artist of artists) {
      for (const title of new Set(titles.map(withoutFeature))) {
        const params = new URLSearchParams({ artist_name: artist, track_name: title });
        const found = await getMatch(await search(params, controller.signal));
        if (found) return found;
      }
    }
    return { status: 'missing' };
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
