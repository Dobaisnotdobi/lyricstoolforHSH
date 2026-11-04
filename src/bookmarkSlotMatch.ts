import type { BugsAlbum } from './bugsAlbum';

const storageKey = 'lyrics-recent-apple-album';
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const names = (primary: string, alternate?: string) =>
  [...new Set([primary, alternate].filter((s): s is string => !!s).map(normalize))];

interface AlbumSignature {
  id: string;
  titles: string[];
  artists: string[];
  releaseDate?: string;
  tracks: { id: string; number: number; titles: string[]; artists: string[]; duration?: number }[];
}

type IncomingAlbum = Pick<BugsAlbum, 'title' | 'artist' | 'tracks'> & { releaseDate?: string };

function validNames(values: unknown): values is string[] {
  return Array.isArray(values) && values.length > 0 && values.length <= 2
    && values.every(v => typeof v === 'string' && v.length > 0 && v.length <= 1000);
}

function validAlbum(a: AlbumSignature): boolean {
  return !!a && typeof a.id === 'string' && /^apple:[1-9]\d*$/.test(a.id)
    && validNames(a.titles) && validNames(a.artists) && Array.isArray(a.tracks)
    && a.tracks.length > 0 && a.tracks.length <= 500 && new Set(a.tracks.map(t => t.id)).size === a.tracks.length
    && (!a.releaseDate || /^\d{4}-\d{2}-\d{2}$/.test(a.releaseDate))
    && a.tracks.every((t, i) => typeof t.id === 'string' && t.id.startsWith(a.id + ':')
      && /^[1-9]\d*$/.test(t.id.slice(a.id.length + 1)) && t.number === i + 1
      && validNames(t.titles) && validNames(t.artists) && (t.duration === undefined || (Number.isFinite(t.duration) && t.duration > 0)));
}

export function rememberAppleAlbum(album: BugsAlbum & { releaseDate?: string; trackCount?: number }) {
  if (album.source !== 'apple') return;
  try {
    // Discard the previous selection even if this release is partial or storage is full.
    localStorage.removeItem(storageKey);
    if (album.trackCount !== undefined && album.trackCount !== album.tracks.length) return;
    const snapshot: AlbumSignature = {
      id: album.id, titles: names(album.title, album.alternateAlbumTitle),
      artists: names(album.artist, album.alternateArtist), releaseDate: album.releaseDate,
      tracks: album.tracks.map(t => {
        const artist = t.artist || album.artist;
        const alternate = t.alternateArtist || (artist === album.artist ? album.alternateArtist : undefined);
        return {
          id: t.id, number: t.number, titles: names(t.title, t.alternateTitle),
          artists: names(artist, alternate), duration: t.duration,
        };
      }),
    };
    if (validAlbum(snapshot)) localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch { /* Matching is optional when browser storage is unavailable. */ }
}

function matchesArtist(label: string, candidates: string[]) {
  const s = normalize(label);
  if (candidates.includes(s)) return true;
  // Bugs may print both names together, e.g. 최엘비 (CHOILB). Both must be known Apple labels.
  const pair = /^([^()]+)\s*\(([^()]+)\)$/.exec(s);
  return !!pair && candidates.includes(pair[1].trim()) && candidates.includes(pair[2].trim());
}

export function matchRecentAppleAlbum(incoming: IncomingAlbum, existing: ReadonlySet<string>): Map<string, string> {
  const empty = new Map<string, string>();
  try {
    const saved: AlbumSignature = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!validAlbum(saved) || incoming.tracks.length !== saved.tracks.length
      || !saved.titles.includes(normalize(incoming.title)) || !matchesArtist(incoming.artist, saved.artists)
      || (saved.releaseDate && incoming.releaseDate && saved.releaseDate !== incoming.releaseDate)
      || !saved.tracks.some(t => existing.has(t.id))) return empty;

    const bugsPrefix = /^bugs:[1-9]\d*:/.exec(incoming.tracks[0].id)?.[0];
    if (!bugsPrefix || new Set(incoming.tracks.map(t => t.id)).size !== incoming.tracks.length) return empty;
    const mappings = new Map<string, string>();
    for (const [i, track] of incoming.tracks.entries()) {
      const prior = saved.tracks[i];
      if (!track.id.startsWith(bugsPrefix) || track.number !== prior.number
        || !prior.titles.includes(normalize(track.title)) || !matchesArtist(track.artist || incoming.artist, prior.artists)
        || (prior.duration && track.duration && Math.abs(prior.duration - track.duration) > 2)) return empty;
      if (!existing.has(track.id)) mappings.set(track.id, prior.id);
    }
    return mappings;
  } catch { return empty; }
}
