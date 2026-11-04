import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchConfirmedLyrics, lookupOnlineLyrics } from '../src/onlineLyrics.ts';
import { searchCatalogAlbums } from '../src/albumCatalog.ts';

const record = {
  id: 101, artistName: 'Example Artist', albumName: 'Telescope', trackName: 'Blue Window',
  duration: 171, hasPlainLyrics: true, plainLyrics: 'A test line',
};
const query = { title: '파란 창', artist: '예시 가수', albumTitle: '망원경', duration: 171 };

test('artist search retains selectable storefront results when translated labels are unavailable', async t => {
  const hit = { wrapperType: 'collection', collectionType: 'Album', collectionId: 42, trackCount: 3, collectionName: 'Telescope', artistName: 'Example Artist' };
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const url = new URL(path);
    const fromArtistSearch = url.pathname === '/search' && url.searchParams.get('attribute') === 'artistTerm';
    return Response.json({ results: fromArtistSearch ? [hit] : [] });
  });
  assert.deepEqual((await searchCatalogAlbums('예시 가수', undefined, 'artist')).map(a => a.id), ['apple:42']);
});

test('verified title and artist alternatives find the same recording among invalid rows and other versions', async t => {
  const alternate = { ...record, trackName: 'Blue Window (파란 창)' };
  t.mock.method(globalThis, 'fetch', async (path: string) => Response.json(
    path.includes('/api/v2/search?')
      ? [{ ...record, id: 100, duration: null }, { ...record, id: 102, duration: 209 }, alternate]
      : alternate,
  ));
  const result = await lookupOnlineLyrics({
    ...query, alternateTitle: 'Blue Window', alternateArtist: 'Example Artist', alternateAlbumTitle: 'Telescope',
  });
  assert.equal(result.status, 'found');
  if (result.status === 'found') assert.equal(result.recordId, alternate.id);
});

test('similar duration and a different-script title require confirmation; a changed record is rejected', async t => {
  let body = record;
  const mock = t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path.includes('/api/v2/search?')) return Response.json([record]);
    if (path.includes('/api/get?')) return new Response(null, { status: 404 });
    return Response.json(body);
  });
  const result = await lookupOnlineLyrics({ ...query, artist: record.artistName, albumTitle: record.albumName });
  assert.equal(result.status, 'missing');
  if (result.status !== 'missing') return;
  assert.equal(result.candidates?.length, 1);
  assert(!mock.mock.calls.some(call => String(call.arguments[0]).includes('/api/get/101')));
  const candidate = result.candidates![0];
  assert.equal((await fetchConfirmedLyrics(candidate)).status, 'found');
  body = { ...record, trackName: 'Blue Window (Live)' };
  assert.equal((await fetchConfirmedLyrics(candidate)).status, 'missing');
});
