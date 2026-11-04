export interface BugsTrack {
  id: string;
  number: number;
  title: string;
  url?: string;
  adult?: boolean;
}

export interface BugsAlbum {
  id: string;
  url: string;
  title: string;
  artist: string;
  source: 'sample' | 'paste';
  tracks: BugsTrack[];
}

const bugsOrigin = 'https://music.bugs.co.kr';
const invalidUrl = '벅스 앨범 주소를 입력해 주세요. 예: https://music.bugs.co.kr/album/4091642';

export function normalizeBugsAlbumUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(invalidUrl);
  }
  const id = url.pathname.match(/^\/album\/([1-9]\d*)\/?$/)?.[1];
  if (url.origin !== bugsOrigin || url.username || url.password || !id) throw new Error(invalidUrl);
  return { id, url: `${bugsOrigin}/album/${id}` };
}

type TrackRow = Omit<BugsTrack, 'id'>;

function identify(albumId: string, rows: TrackRow[]): BugsTrack[] {
  const occurrences = new Map<string, number>();
  return rows.map(row => {
    // Plain-text selections have no Bugs track ID. Use the same identity for all input formats.
    const name = row.title.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const count = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, count);
    return { ...row, id: `bugs:${albumId}:${name}:${count}` };
  });
}

// Title metadata from https://music.bugs.co.kr/album/4091642. The demo contains no lyrics.
const sampleRows: [string, string, boolean][] = [
  ['6217307', '14-23', true],
  ['6217308', '식사 (FEAT. 필리)', true],
  ['6217309', 'OUTCOME (FEAT. Khundi Panda)', true],
  ['6217310', '아버지 (FEAT. 권기백)', false],
  ['6217311', '현주소', true],
  ['6217312', 'XXK NEXT LEVEL (FEAT. XXK)', true],
  ['6217313', '내 방에서 나가', true],
  ['6217314', '파이트 (FEAT. KOR KASH)', true],
  ['6217315', '해방', false],
  ['6217316', '공생', false],
  ['6217317', '진실', false],
  ['6217318', '욕심', false],
];

export function getBugsSample(input: string): BugsAlbum | null {
  const album = normalizeBugsAlbumUrl(input);
  if (album.id !== '4091642') return null;
  const rows = sampleRows.map(([id, title, adult], index) => ({
    number: index + 1, title, adult, url: `${bugsOrigin}/track/${id}`,
  }));
  return { ...album, title: '해방', artist: '스카이민혁 (Skyminhyuk)', source: 'sample', tracks: identify(album.id, rows) };
}

function parseHtml(albumId: string, html: string) {
  // Template contents stay inert: no image loads, event handlers or scripts run.
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const rows: TrackRow[] = [];
  for (const tr of fragment.querySelectorAll('tr')) {
    const title = tr.querySelector('.title a, th[scope="row"] a')?.textContent?.trim();
    const info = tr.querySelector('a[href*="/track/"]')?.getAttribute('href') ?? '';
    const trackId = tr.getAttribute('trackid') ?? info.match(/^(?:https:\/\/music\.bugs\.co\.kr)?\/track\/(\d+)\/?(?:[?#]|$)/)?.[1];
    if (!title || !trackId || !/^\d+$/.test(trackId)) continue;
    const sourceId = tr.getAttribute('albumid');
    if (sourceId && sourceId !== albumId) throw new Error('붙여넣은 수록곡의 앨범과 입력한 주소가 다릅니다.');
    rows.push({
      number: Number(tr.querySelector('.trackIndex em')?.textContent) || rows.length + 1,
      title, url: `${bugsOrigin}/track/${trackId}`,
      adult: !!tr.querySelector('.o19, [adult_yn="Y"]') || !!tr.querySelector('th[scope="row"]')?.textContent?.includes('[19금]'),
    });
  }
  const title = fragment.querySelector('.pgTitle h1')?.textContent?.trim();
  const artist = fragment.querySelector('.basicInfo a[href*="/artist/"]')?.textContent?.trim();
  return { rows, title, artist };
}

function textRow(number: number, label: string): TrackRow {
  return { number, title: label.replace(/^\[19금\]\s*/, '').trim(), adult: label.startsWith('[19금]') };
}

function parseText(text: string): TrackRow[] {
  const rows: TrackRow[] = [];
  // Browsers may serialize each table cell on its own line or separate cells with tabs.
  const cells = text.split(/[\r\n\t]+/).map(cell => cell.trim()).filter(Boolean);
  for (let i = 1; i < cells.length - 1; i++) {
    if (cells[i] !== '곡정보') continue;
    const previous = cells[i - 1] === '[타이틀곡]' ? cells[i - 2] : cells[i - 1];
    const index = previous?.match(/^(\d+)(?:\s*\[타이틀곡\])?$/);
    if (!index) continue;
    const label = cells[i + 1] === '[19금]' ? '[19금] ' + (cells[i + 2] ?? '') : cells[i + 1];
    rows.push(textRow(Number(index[1]), label));
  }
  if (rows.length) return rows.filter(row => row.title);

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => line.includes('\t'))) {
    for (const line of lines) {
      const [index, label] = line.split(/\t+/);
      if (/^\d+$/.test(index) && label) rows.push(textRow(Number(index), label.trim()));
    }
  } else {
    lines.forEach((line, i) => rows.push(textRow(i + 1, line.replace(/^\d+[.)]\s+/, ''))));
  }
  return rows.filter(row => row.title);
}

export function parseBugsTracklist(input: string, text: string, html?: string): BugsAlbum {
  const album = normalizeBugsAlbumUrl(input);
  const rich = html ? parseHtml(album.id, html) : undefined;
  const rows = rich?.rows.length ? rich.rows : parseText(text);
  if (!rows.length) throw new Error('수록곡 표를 복사하거나 곡 제목을 한 줄에 하나씩 입력해 주세요.');
  return {
    ...album, title: rich?.title || `앨범 ${album.id}`, artist: rich?.artist || '',
    source: 'paste', tracks: identify(album.id, rows),
  };
}
