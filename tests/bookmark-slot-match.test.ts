import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRecentAppleAlbum, rememberAppleAlbum } from '../src/bookmarkSlotMatch.ts';

test('only a matching full release reuses Apple slots, and existing Bugs slots take precedence', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  rememberAppleAlbum({
    id: 'apple:42', source: 'apple', title: 'Telescope', alternateAlbumTitle: '망원경',
    artist: 'Example Artist', alternateArtist: '예시 가수', releaseDate: '2021-11-07',
    url: 'https://music.apple.com/us/album/42', trackCount: 2,
    tracks: [
      { id: 'apple:42:51', number: 1, title: 'Blue Window', alternateTitle: '파란 창' },
      { id: 'apple:42:52', number: 2, title: 'Night Sky', alternateTitle: '밤하늘' },
    ],
  });
  const bugs = {
    title: '망원경', artist: '예시 가수 (Example Artist)', releaseDate: '2021-11-07',
    tracks: [
      { id: 'bugs:88:파란 창:1', number: 1, title: '파란 창' },
      { id: 'bugs:88:밤하늘:1', number: 2, title: '밤하늘' },
    ],
  };
  const [first, second] = bugs.tracks;
  const existing = new Set(['apple:42:51']);
  assert.deepEqual([...matchRecentAppleAlbum(bugs, existing)], [[first.id, 'apple:42:51'], [second.id, 'apple:42:52']]);
  assert.deepEqual([...matchRecentAppleAlbum(bugs, new Set([...existing, first.id]))], [[second.id, 'apple:42:52']]);
  assert.equal(matchRecentAppleAlbum(bugs, new Set(['apple:99:51'])).size, 0);
  assert.equal(matchRecentAppleAlbum({ ...bugs, releaseDate: '2024-03-01' }, existing).size, 0);
  const reordered = [{ ...second, number: 1 }, { ...first, number: 2 }];
  assert.equal(matchRecentAppleAlbum({ ...bugs, tracks: reordered }, existing).size, 0);
});
