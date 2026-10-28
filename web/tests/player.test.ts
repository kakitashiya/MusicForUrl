import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/lib/api';
import { usePlayer } from '../src/stores/player';
import type { PlayerPlaylist, ResolvedSource } from '../src/lib/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function playlist(id: string): PlayerPlaylist {
  return { id, name: id, cover: '', platform: 'netease', grant: '', tracks: [
    { id: `${id}-1`, name: 'First', artist: '', cover: '', duration: 180 },
    { id: `${id}-2`, name: 'Second', artist: '', cover: '', duration: 180 },
  ] };
}
function source(id: string): ResolvedSource {
  return { mediaUrl: `https://example.invalid/${id}`, coverUrl: '', song: playlist(id).tracks[0],
    requestedQuality: 'low', quality: 'low', format: 'mp3', bitrate: 128000, trial: false, warnings: [], expiresAt: 0 };
}
function reset() { usePlayer.getState().clear(); usePlayer.setState({ quality: 'low' }); }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

for (const outcome of ['success', 'error'] as const) {
  test(`latest open wins over stale playlist ${outcome}`, async t => {
    reset(); t.after(reset);
    const old = deferred<PlayerPlaylist>();
    t.mock.method(api, 'playerPlaylist', (_platform: unknown, id: string) => id === 'old' ? old.promise : Promise.resolve(playlist(id)));
    t.mock.method(api, 'resolve', (_platform: unknown, options: { playlistId: string }) => Promise.resolve(source(options.playlistId)));
    const pending = usePlayer.getState().open('netease', 'old');
    await usePlayer.getState().open('netease', 'new');
    if (outcome === 'success') old.resolve(playlist('old')); else old.reject(new Error('stale playlist failure'));
    await pending;
    assert.equal(usePlayer.getState().playlist?.id, 'new');
    assert.equal(usePlayer.getState().source?.mediaUrl, source('new').mediaUrl);
    assert.equal(usePlayer.getState().message, '');
  });

  test(`clear ignores pending playlist ${outcome}`, async t => {
    reset(); t.after(reset);
    const old = deferred<PlayerPlaylist>();
    t.mock.method(api, 'playerPlaylist', () => old.promise);
    t.mock.method(api, 'resolve', () => Promise.resolve(source('old')));
    const pending = usePlayer.getState().open('netease', 'old');
    usePlayer.getState().clear();
    if (outcome === 'success') old.resolve(playlist('old')); else old.reject(new Error('stale playlist failure'));
    await pending;
    assert.equal(usePlayer.getState().playlist, null);
    assert.equal(usePlayer.getState().source, null);
    assert.equal(usePlayer.getState().status, 'idle');
  });

  test(`opening another playlist immediately invalidates old resolve ${outcome}`, async t => {
    reset(); t.after(reset);
    const oldSource = deferred<ResolvedSource>();
    const newPlaylist = deferred<PlayerPlaylist>();
    t.mock.method(api, 'playerPlaylist', (_platform: unknown, id: string) => id === 'new' ? newPlaylist.promise : Promise.resolve(playlist(id)));
    t.mock.method(api, 'resolve', (_platform: unknown, options: { playlistId: string }) => options.playlistId === 'old' ? oldSource.promise : Promise.resolve(source('new')));
    const oldOpen = usePlayer.getState().open('netease', 'old');
    await tick();
    const newOpen = usePlayer.getState().open('netease', 'new');
    if (outcome === 'success') oldSource.resolve(source('old')); else oldSource.reject(new ApiError('stale unavailable', 'unavailable'));
    await oldOpen;
    assert.equal(usePlayer.getState().source, null);
    assert.equal(usePlayer.getState().message, '');
    assert.equal(usePlayer.getState().status, 'loading');
    newPlaylist.resolve(playlist('new')); await newOpen;
    assert.equal(usePlayer.getState().playlist?.id, 'new');
  });
}

test('fetch receives cancellation signals for playlist and source, including clear and track switches', async t => {
  reset(); t.after(reset);
  const requests: { url: string; signal: AbortSignal | null | undefined; task: ReturnType<typeof deferred<Response>> }[] = [];
  t.mock.method(globalThis, 'fetch', (url: string, init: RequestInit) => {
    const task = deferred<Response>(); requests.push({ url, signal: init.signal, task }); return task.promise;
  });
  const respond = (index: number, data: unknown) => requests[index].task.resolve(new Response(JSON.stringify({ success: true, data })));
  const first = usePlayer.getState().open('netease', 'one');
  assert.ok(requests[0].signal instanceof AbortSignal);
  const second = usePlayer.getState().open('netease', 'two');
  assert.equal(requests[0].signal?.aborted, true);
  respond(0, playlist('one')); await first;
  respond(1, playlist('two')); await tick();
  assert.ok(requests[2].signal instanceof AbortSignal);
  const switchTrack = usePlayer.getState().playIndex(1);
  assert.equal(requests[2].signal?.aborted, true);
  respond(2, source('stale')); await second;
  usePlayer.getState().clear();
  assert.equal(requests[3].signal?.aborted, true);
  respond(3, source('cleared')); await switchTrack;
  assert.equal(usePlayer.getState().source, null);
  assert.equal(usePlayer.getState().status, 'idle');
});

test('quality and retry retain playlist/index and forward fresh resolution options', async t => {
  reset(); t.after(reset);
  const calls: { songId: string; quality: string; fresh?: boolean }[] = [];
  t.mock.method(api, 'playerPlaylist', () => Promise.resolve(playlist('one')));
  t.mock.method(api, 'resolve', (_platform: unknown, options: { songId: string; quality: string; fresh?: boolean }) => { calls.push(options); return Promise.resolve(source(options.songId)); });
  await usePlayer.getState().open('netease', 'one');
  await usePlayer.getState().playIndex(1);
  await usePlayer.getState().setQuality('high');
  await usePlayer.getState().retry();
  assert.equal(usePlayer.getState().index, 1);
  assert.equal(usePlayer.getState().playlist?.id, 'one');
  assert.equal(calls.at(-1)?.songId, 'one-2');
  assert.equal(calls.at(-1)?.quality, 'high');
  assert.equal(calls.at(-1)?.fresh, true);
  assert.equal(usePlayer.getState().autoplay, true);
});

for (const outcome of ['success', 'error'] as const) {
  for (const action of ['clear', 'switch'] as const) {
    test(`${action} ignores stale source ${outcome}`, async t => {
      reset(); t.after(reset);
      const old = deferred<ResolvedSource>();
      t.mock.method(api, 'playerPlaylist', () => Promise.resolve(playlist('one')));
      t.mock.method(api, 'resolve', (_platform: unknown, options: { songId: string }) => options.songId === 'one-1' ? old.promise : Promise.resolve(source('new-track')));
      const open = usePlayer.getState().open('netease', 'one');
      await tick();
      if (action === 'clear') usePlayer.getState().clear(); else await usePlayer.getState().playIndex(1);
      if (outcome === 'success') old.resolve(source('stale')); else old.reject(new ApiError('stale unavailable', 'unavailable'));
      await open;
      assert.equal(usePlayer.getState().source?.mediaUrl ?? null, action === 'clear' ? null : source('new-track').mediaUrl);
      assert.equal(usePlayer.getState().message, '');
      assert.equal(usePlayer.getState().status, action === 'clear' ? 'idle' : 'loading');
    });
  }
}

test('unavailable track still advances after delay and clear cancels scheduled skip', async t => {
  reset(); t.after(reset);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(api, 'playerPlaylist', () => Promise.resolve(playlist('one')));
  const resolve = t.mock.method(api, 'resolve', (_platform: unknown, options: { songId: string }) => options.songId === 'one-1'
    ? Promise.reject(new ApiError('unavailable', 'unavailable')) : Promise.resolve(source('second')));
  await usePlayer.getState().open('netease', 'one');
  assert.equal(usePlayer.getState().errorCode, 'unavailable');
  t.mock.timers.tick(1199);
  assert.equal(usePlayer.getState().index, 0);
  t.mock.timers.tick(1); await tick();
  assert.equal(usePlayer.getState().index, 1);
  assert.equal(usePlayer.getState().source?.mediaUrl, source('second').mediaUrl);
  await usePlayer.getState().playIndex(0);
  const calls = resolve.mock.callCount();
  usePlayer.getState().clear();
  t.mock.timers.tick(1200); await tick();
  assert.equal(resolve.mock.callCount(), calls);
  assert.equal(usePlayer.getState().status, 'idle');
});

for (const outcome of ['success', 'error'] as const) {
  test(`terminal next stays ended after pending source ${outcome}`, async t => {
    reset(); t.after(reset);
    const last = deferred<ResolvedSource>();
    t.mock.method(api, 'playerPlaylist', () => Promise.resolve(playlist('one')));
    t.mock.method(api, 'resolve', (_platform: unknown, options: { songId: string }) => options.songId === 'one-2' ? last.promise : Promise.resolve(source('first')));
    await usePlayer.getState().open('netease', 'one');
    const pending = usePlayer.getState().playIndex(1);
    await usePlayer.getState().next();
    if (outcome === 'success') last.resolve(source('last')); else last.reject(new Error('late failure'));
    await pending;
    assert.equal(usePlayer.getState().status, 'ended');
    assert.equal(usePlayer.getState().message, '歌单播放结束');
  });
}
