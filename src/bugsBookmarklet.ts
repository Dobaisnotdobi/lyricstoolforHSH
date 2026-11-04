// This function is serialized into a bookmark. Keep all runtime dependencies inside it.
function runOnBugs() {
  const bugs = 'https://music.bugs.co.kr';
  const viewer = 'https://dobaisnotdobi.github.io';
  const albumId = location.pathname.match(/^\/album\/([1-9]\d*)\/?$/)?.[1];
  if (window !== window.top || location.origin !== bugs || !albumId) {
    alert('벅스 앨범 페이지를 연 뒤 북마크를 눌러 주세요.');
    return;
  }

  const artists = (el: ParentNode, selector: string) => [...new Set([...el.querySelectorAll(selector)]
    .map(a => a.textContent.trim()).filter(Boolean))].join(', ');
  const title = document.querySelector('.pgTitle h1')?.textContent.trim();
  const artist = artists(document, '.basicInfo a[href*="/artist/"]');
  const repeats = new Map<string, number>();
  const tracks = [];
  for (const row of document.querySelectorAll('tr[trackid][albumid]')) {
    if (row.getAttribute('albumid') !== albumId) continue;
    const trackId = row.getAttribute('trackid');
    const name = row.querySelector('.title a')?.textContent.trim();
    if (!name || !/^[1-9]\d*$/.test(trackId)) continue;
    const key = name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const occurrence = (repeats.get(key) || 0) + 1;
    repeats.set(key, occurrence);
    tracks.push({
      id: `bugs:${albumId}:${key}:${occurrence}`, trackId, title: name,
      number: Number(row.querySelector('.trackIndex em')?.textContent) || tracks.length + 1,
      artist: artists(row, '.artist a[href*="/artist/"]') || artist, url: `${bugs}/track/${trackId}`,
      adult: !!row.querySelector('.o19, [adult_yn="Y" i]'),
    });
  }
  if (!title || !tracks.length || tracks.length > 500 || new Set(tracks.map(t => t.trackId)).size !== tracks.length) {
    alert('벅스 수록곡 표를 확인할 수 없습니다. 500곡 이하의 앨범 페이지에서 실행해 주세요.');
    return;
  }
  const dateCell = [...document.querySelectorAll('.basicInfo th')].find(th => th.textContent.trim() === '발매일')?.nextElementSibling;
  const date = dateCell?.querySelector('time')?.getAttribute('datetime')?.replace(/\./g, '-');
  const releaseDate = date && /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date) ? date : undefined;
  const album = { id: albumId, title, artist, tracks, releaseDate, url: `${bugs}/album/${albumId}`, source: 'bookmark' };
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const popup = window.open(`${viewer}/lyricstoolforHSH/#bugs-bridge=${nonce}`, '_blank');
  if (!popup) { alert('벅스의 팝업을 허용하고 북마크를 다시 눌러 주세요.'); return; }

  const controller = new AbortController();
  let announced = false;
  let running = false;
  let ended = false;
  let lastContact = Date.now();
  const send = (type: string, data = {}) => {
    if (!popup.closed) popup.postMessage({ channel: 'lyrics-bugs-v1', nonce, type, ...data }, viewer);
  };
  function finish(reason?: string) {
    if (ended) return;
    ended = true;
    controller.abort();
    clearInterval(watch);
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', leave);
    send('done', reason ? { reason } : {});
  }
  function leave() { finish('벅스 앨범 창을 떠나 가져오기가 끝났습니다.'); }
  const watch = window.setInterval(() => {
    if (popup.closed || (!running && Date.now() - lastContact > 5 * 60 * 1000)) finish('연결이 종료되었습니다. 북마크를 다시 눌러 주세요.');
  }, 2000);

  async function getItem(track: typeof tracks[number]) {
    if (track.adult) return { status: 'restricted' };
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    const res = await fetch(`${bugs}/track/${track.trackId}`, {
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (res.status === 401 || res.status === 403) return { status: 'restricted' };
    if (res.status === 429) throw new Error('벅스의 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.');
    if (!res.ok || !res.body || !res.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
      throw new Error('벅스에서 곡 페이지를 불러오지 못했습니다.');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 3 * 1024 * 1024) { await reader.cancel(); throw new Error('곡 페이지 크기가 너무 큽니다.'); }
      html += decoder.decode(value, { stream: true });
    }
    // Never attach remote markup to the document. Only Bugs' visible raw-text lyrics element is read.
    const template = document.createElement('template');
    template.innerHTML = html + decoder.decode();
    const box = template.content.querySelector('section.lyrics .lyricsContainer');
    if (box?.querySelector('.certificationGuide')) return { status: 'restricted' };
    if (box?.querySelector('.comingsoon')) return { status: 'missing' };
    const body = box?.querySelector('xmp');
    if (!body) throw new Error('곡 페이지에서 공개 가사 영역을 확인할 수 없습니다.');
    for (let el: HTMLElement = body; el; el = el.parentElement) {
      if (el.matches('[hidden], [inert], [aria-hidden="true" i], .blind, .hide, .hidden') || el.style.display === 'none'
        || ['hidden', 'collapse'].includes(el.style.visibility)) return { status: 'restricted' };
    }
    const lyrics = body.textContent.replace(/\r\n?/g, '\n').trim();
    if (lyrics.length > 200000) throw new Error('곡 가사 길이가 너무 깁니다.');
    return lyrics ? { status: 'ready', lyrics } : { status: 'missing' };
  }

  async function collect(selected: typeof tracks) {
    let length = 0;
    for (const [i, track] of selected.entries()) {
      if (ended) return;
      send('progress', { index: i + 1, total: selected.length, title: track.title });
      try {
        const item = await getItem(track);
        if (ended) return;
        length += item.lyrics?.length || 0;
        if (length > 3000000) throw new Error('한 번에 가져올 수 있는 가사 크기를 넘었습니다.');
        send('item', { trackId: track.trackId, ...item });
      } catch (err) {
        if (!ended) {
          send('item', { trackId: track.trackId, status: 'error' });
          const reason = err instanceof Error && err.name === 'TimeoutError' ? '벅스 응답 시간이 초과됐습니다.'
            : err instanceof Error && err.name === 'Error' ? err.message : '벅스에 연결할 수 없습니다.';
          finish(reason);
        }
        return;
      }
      if (i + 1 < selected.length) await new Promise(resolve => setTimeout(resolve, 350));
    }
    finish();
  }
  function receive(event: MessageEvent) {
    const data = event.data;
    if (ended || event.origin !== viewer || event.source !== popup || data?.channel !== 'lyrics-bugs-v1' || data.nonce !== nonce) return;
    lastContact = Date.now();
    if (data.type === 'ready' && !running) { announced = true; send('album', { album }); return; }
    if (data.type === 'cancel') { finish('가져오기를 중단했습니다.'); return; }
    if (data.type !== 'import' || !announced || running) return;
    const ids = data.trackIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) { finish('한 번에 1~100곡을 선택해 주세요.'); return; }
    const selection = new Set(ids);
    const selected = tracks.filter(t => selection.has(t.trackId));
    if (selected.length !== ids.length) { finish('선택한 곡 목록을 확인할 수 없습니다.'); return; }
    running = true;
    void collect(selected);
  }
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', leave, { once: true });
}

export function makeBugsBookmarklet() {
  return `javascript:${encodeURIComponent(`void (${runOnBugs.toString()})()`)}`;
}
