import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import policy from '../../lib/player-policy.js';
import { createPlaybackToken, getPlaybackUser, getSessionUser } from '../src/security.js';
import { adapter, parsePlaylistId, validPlaylistId, validSongId } from '../src/playlists.js';
import { PLATFORMS, capabilityMatrix, guestUser, platformFromPath } from '../src/platforms.js';
import { routeKey } from '../src/telemetry.js';
import { readSiteStats, refreshSiteStats } from '../src/stats.js';

const KUGOU_HASH = 'F460C7B867DCC5F49A0FB9574954CFD7';
const KUGOU_320 = 'EEE71C794B070253D4A51EF8D14FA42F';

function testEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        runSync() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: result.changes } };
        },
        async run() { return this.runSync(); },
      };
    },
  };
  return { DB, sqlite, ENCRYPTION_KEY: 'test-secret-7e8c8cf1369f49cdb64ba6dc4d8e8170' };
}

function stubFetch(routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) return handler(url, init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

const json = value => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json' },
});

test('platform prefixes keep the legacy URL surface intact', () => {
  // 线上 VRChat 里已经签发的链接依赖这两个映射，改动等于全部失效
  assert.deepEqual(platformFromPath('/api/playlist/m3u8/x/1/stream.m3u8'),
    { id: 'netease', path: '/playlist/m3u8/x/1/stream.m3u8' });
  assert.deepEqual(platformFromPath('/api/qq/playlist/m3u8/x/1/stream.m3u8'),
    { id: 'qq', path: '/playlist/m3u8/x/1/stream.m3u8' });
  assert.deepEqual(platformFromPath('/api/kugou/song/t/abc.mp3'), { id: 'kugou', path: '/song/t/abc.mp3' });
  assert.deepEqual(platformFromPath('/api/kuwo/playlist/parse'), { id: 'kuwo', path: '/playlist/parse' });
  // 更长前缀必须优先，否则 /api/qq 会被 /api 抢走
  assert.equal(platformFromPath('/api/qq/health').id, 'qq');
});

test('playlist and song ID shapes are validated per platform', () => {
  assert.equal(parsePlaylistId('https://music.163.com/playlist?id=123456', 'netease'), '123456');
  assert.equal(parsePlaylistId('https://y.qq.com/n/ryqq/playlist/7654321', 'qq'), '7654321');
  assert.equal(parsePlaylistId('https://www.kugou.com/yy/special/single/1234567.html', 'kugou'), '1234567');
  assert.equal(parsePlaylistId('https://m.kugou.com/plist/list/1234567?json=true', 'kugou'), '1234567');
  assert.equal(parsePlaylistId('https://www.kuwo.cn/playlist_detail/3095611894', 'kuwo'), '3095611894');
  assert.equal(parsePlaylistId('3095611894', 'kuwo'), '3095611894');
  // 跨平台的链接不应该被当成合法输入
  assert.equal(parsePlaylistId('https://www.kuwo.cn/playlist_detail/3095611894', 'netease'), null);
  assert.equal(parsePlaylistId('not a url', 'kugou'), null);

  assert.ok(validSongId('555', 'netease'));
  assert.ok(!validSongId(KUGOU_HASH, 'netease'));
  assert.ok(validSongId('001QuJq0Y6YkqN', 'qq'));
  assert.ok(validSongId(KUGOU_HASH, 'kugou'));
  // 酷狗用复合 ID 编码三档音质，缺档位时允许更短
  assert.ok(validSongId(`${KUGOU_HASH}-${KUGOU_320}`, 'kugou'));
  assert.ok(!validSongId('F460C7B', 'kugou'));
  assert.ok(validSongId('293781643', 'kuwo'));
  assert.ok(!validPlaylistId(KUGOU_HASH, 'kuwo'));
});

test('capability matrix declares the account boundary for every platform', () => {
  const matrix = capabilityMatrix();
  assert.deepEqual(matrix.map(item => item.id), ['netease', 'qq', 'kugou', 'kuwo']);
  for (const item of matrix) {
    assert.equal(typeof item.label, 'string');
    // 账号能力与「我的音乐」必须一致：没有账号就不可能有个人歌单
    assert.equal(item.library, item.account, `${item.id}: library 与 account 必须一致`);
  }
  assert.equal(PLATFORMS.kugou.account, false);
  assert.equal(PLATFORMS.kuwo.account, false);
  assert.equal(PLATFORMS.kugou.playback, true);
});

test('guest playback tokens verify without touching D1 and cannot cross platforms', async t => {
  const env = testEnv(); t.after(() => env.sqlite.close());
  let reads = 0;
  const DB = {
    prepare(sql) { reads++; return env.DB.prepare(sql); },
    batch: env.DB.batch,
  };
  const guest = guestUser('kugou');
  const token = await createPlaybackToken({ ...env, DB }, guest, '1234567');

  const verified = await getPlaybackUser({ ...env, DB }, token, 'kugou', '1234567');
  assert.equal(verified.platform, 'kugou');
  assert.equal(verified.guest, true);
  assert.equal(verified.id, 0);
  // 游客令牌不查库：每个音频分片请求因此省掉一次 D1 读取
  assert.equal(reads, 0);

  assert.equal(await getPlaybackUser(env, token, 'netease', '1234567'), null);
  assert.equal(await getPlaybackUser(env, token, 'kugou', '7654321'), null);
  assert.equal(await getPlaybackUser(env, `${token}x`, 'kugou', '1234567'), null);

  // 游客平台不接受任何会话令牌
  const session = new Request('https://music.example.test/api/kugou/auth/status',
    { headers: { 'x-kugou-token': token } });
  assert.equal(await getSessionUser(env, session, 'kugou', new URL(session.url)), null);
});

test('audio host allowlists are per platform', () => {
  assert.equal(policy.allowedSource('https://m1.music.126.net/a.mp3', 'netease'), 'https://m1.music.126.net/a.mp3');
  assert.equal(policy.allowedSource('https://m1.music.126.net/a.mp3', 'kugou'), null);
  assert.equal(policy.allowedSource('https://fs.kgimg.com/a.mp3', 'kugou'), 'https://fs.kgimg.com/a.mp3');
  assert.equal(policy.allowedSource('http://kw-lv.kuwo.cn/a.mp3', 'kuwo'), 'https://kw-lv.kuwo.cn/a.mp3');
  assert.equal(policy.allowedSource('https://kw-lv.kuwo.cn/a.mp3', 'qq'), null);
  assert.equal(policy.allowedSource('https://evil.example.com/a.mp3', 'kugou'), null);
});

test('kugou adapter paginates, builds composite song IDs and rewrites cover sizes', async t => {
  const pages = [];
  const restore = stubFetch([
    // 元数据接口：注意它忽略 page/pagesize，永远只返回前 10 首，所以只用来取名称与封面
    [/\/plist\/list\/1234567\?json=true$/, () => json({
      pagesize: 10,
      list: { list: { total: 35, info: [
        { hash: KUGOU_HASH, '320hash': KUGOU_320, sqhash: '', filename: '曲肖冰 - 静悄悄', duration: 184 },
        { hash: '', filename: '坏数据', duration: 10 },
      ] } },
      info: { list: { specialname: '测试歌单', imgurl: 'http://imge.kugou.com/soft/collection/{size}/x.jpg' } },
    })],
    [/mobiles\.kugou\.com\/api\/v3\/special\/song\?/, (url) => {
      const page = Number(url.match(/page=(\d+)/)[1]);
      pages.push(page);
      if (page === 1) return json({ status: 1, data: { total: 35, info: [
        { hash: KUGOU_HASH, '320hash': KUGOU_320, filename: '曲肖冰 - 静悄悄', duration: 184 },
        { hash: '18B2B218E8204596BEBC08844AD4D9E4', filename: '无分隔符歌名' },
        { hash: '', filename: '坏数据' },
      ] } });
      if (page === 2) return json({ status: 1, data: { total: 35, info: [
        // 与第一页重复的条目必须被去重
        { hash: KUGOU_HASH, filename: '曲肖冰 - 静悄悄' },
        { hash: 'FC88533CAD3A0DEA2AA613C124180CBD', filename: '张惠妹 - 我最亲爱的', duration: 284 },
      ] } });
      return json({ status: 1, data: { total: 35, info: [] } });
    }],
  ]);
  t.after(restore.restore);

  const playlist = await adapter('kugou').getPlaylistDetail('1234567', '', {});
  assert.equal(playlist.name, '测试歌单');
  assert.equal(playlist.cover, 'https://imge.kugou.com/soft/collection/240/x.jpg');
  assert.equal(playlist.songCount, 35);
  // 35 首 / 每页 30 = 2 页，两页都拉到；空 hash 的条目被丢掉，重复条目被去重
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(playlist.tracks.map(track => track.id), [
    `${KUGOU_HASH}-${KUGOU_320}`,
    '18B2B218E8204596BEBC08844AD4D9E4',
    'FC88533CAD3A0DEA2AA613C124180CBD',
  ]);
  assert.equal(playlist.tracks[0].name, '静悄悄');
  assert.equal(playlist.tracks[0].artist, '曲肖冰');
  assert.equal(playlist.tracks[1].name, '无分隔符歌名');
  assert.equal(playlist.tracks[2].duration, 284);
});

test('kugou adapter falls back to the metadata page when pagination breaks', async t => {
  const restore = stubFetch([
    [/\/plist\/list\/1234567\?json=true$/, () => json({
      list: { list: { total: 35, info: [{ hash: KUGOU_HASH, filename: '曲肖冰 - 静悄悄', duration: 184 }] } },
      info: { list: { specialname: '测试歌单', imgurl: '' } },
    })],
    [/mobiles\.kugou\.com/, () => { throw new Error('network down'); }],
  ]);
  t.after(restore.restore);

  // 分页接口挂掉时退回元数据里的前 10 首，而不是整个歌单不可用
  const playlist = await adapter('kugou').getPlaylistDetail('1234567', '', {});
  assert.equal(playlist.tracks.length, 1);
  assert.equal(playlist.songCount, 35);
});

test('kugou adapter maps quality to the right hash and reports paywalled tracks as unavailable', async t => {
  const seen = [];
  const restore = stubFetch([
    [/getSongInfo\.php\?cmd=playInfo&hash=([A-F0-9]+)$/, (url) => {
      const hash = url.match(/hash=([A-F0-9]+)$/)[1];
      seen.push(hash);
      if (hash === KUGOU_320) return json({ url: '', error: '需要付费' });
      return json({ url: 'https://fs.kgimg.com/a.mp3', bitRate: 128000, extName: 'mp3', timeLength: 184 });
    }],
  ]);
  t.after(restore.restore);

  const composite = `${KUGOU_HASH}-${KUGOU_320}`;
  const high = await adapter('kugou').getSongResource(composite, '', { MUSIC_QUALITY: 'high' });
  // 320 档被付费挡住时回退到基础 hash
  assert.equal(high.url, 'https://fs.kgimg.com/a.mp3');
  assert.deepEqual(seen, [KUGOU_320, KUGOU_HASH]);

  seen.length = 0;
  const low = await adapter('kugou').getSongResource(composite, '', { MUSIC_QUALITY: 'low' });
  assert.equal(low.bitrate, 128000);
  assert.deepEqual(seen, [KUGOU_HASH]);
});

test('kuwo adapter requests the matching bitrate and surfaces upstream blocks', async t => {
  const restore = stubFetch([
    [/antiserver\.kuwo\.cn\/anti\.s\?[^ ]*br=320kmp3/, () => new Response('https://kw-bj.kuwo.cn/a.mp3')],
    [/antiserver\.kuwo\.cn\/anti\.s\?[^ ]*br=128kmp3/, () => new Response('convert_url_error')],
  ]);
  t.after(restore.restore);

  const high = await adapter('kuwo').getSongResource('293781643', '', { MUSIC_QUALITY: 'high' });
  assert.equal(high.url, 'https://kw-bj.kuwo.cn/a.mp3');
  assert.equal(high.bitrate, 320000);
  assert.equal(await adapter('kuwo').getSongResource('293781643', '', { MUSIC_QUALITY: 'low' }), null);
});

test('guest platforms serve a full generate → m3u8 → segment chain without a login', async t => {
  const env = testEnv(); t.after(() => env.sqlite.close());
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  const restore = stubFetch([
    [/\/plist\/list\/1234567\?json=true$/, () => json({
      pagesize: 10,
      list: { list: { total: 1, info: [{ hash: KUGOU_HASH, filename: '曲肖冰 - 静悄悄', duration: 184 }] } },
      info: { list: { specialname: '测试歌单', imgurl: '' } },
    })],
    [/mobiles\.kugou\.com\/api\/v3\/special\/song\?/, () => json({
      status: 1, data: { total: 1, info: [{ hash: KUGOU_HASH, filename: '曲肖冰 - 静悄悄', duration: 184 }] },
    })],
    [/getSongInfo\.php/, () => json({ url: 'https://fs.kgimg.com/a.mp3', bitRate: 128000, extName: 'mp3' })],
  ]);
  t.after(restore.restore);

  const generated = await worker.fetch(new Request('https://music.example.test/api/kugou/playlist/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.kugou.com/yy/special/single/1234567.html' }),
  }), env, ctx);
  const body = await generated.json();
  assert.equal(generated.status, 200);
  assert.equal(body.data.playlist.name, '测试歌单');
  assert.match(body.data.url, /^https:\/\/music\.example\.test\/api\/kugou\/playlist\/m3u8\/[^/]+\/1234567\/stream\.m3u8$/);

  const stream = await worker.fetch(new Request(body.data.url), env, ctx);
  const m3u8 = await stream.text();
  assert.match(m3u8, /#EXT-X-VERSION:3/);
  assert.match(m3u8, new RegExp(`/api/kugou/song/[^/]+/${KUGOU_HASH}\\.mp3\\?playlist=1234567&hls=1`));
  assert.match(m3u8, /曲肖冰 - 静悄悄/);

  const segment = await worker.fetch(new Request(
    `https://music.example.test/api/kugou/song/${body.data.url.match(/m3u8\/([^/]+)\//)[1]}/${KUGOU_HASH}.mp3?playlist=1234567`,
  ), env, ctx);
  assert.equal(segment.status, 302);
  assert.equal(segment.headers.get('location'), 'https://fs.kgimg.com/a.mp3');
  await Promise.all(pending);

  // 游客没有 users 行，播放记录不会写进 play_stats，但生成链接会累加解析数
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS total FROM play_stats').get().total, 0);
  assert.equal(env.sqlite.prepare("SELECT value FROM site_stats WHERE key = 'parsedSongs'").get().value, 1);
});

test('guest platforms reject the account-only routes with an actionable message', async () => {
  const env = testEnv();
  const ctx = { waitUntil() {} };
  for (const path of ['/api/kugou/playlist/user', '/api/kuwo/favorites', '/api/kugou/history/recent']) {
    const response = await worker.fetch(new Request(`https://music.example.test${path}`), env, ctx);
    assert.equal(response.status, 403, path);
    assert.match((await response.json()).message, /没有账号体系/);
  }
  const auth = await worker.fetch(new Request('https://music.example.test/api/kuwo/auth/status'), env, ctx);
  const body = await auth.json();
  assert.equal(body.data.logged, false);
  assert.equal(body.data.supported, false);
  const login = await worker.fetch(new Request('https://music.example.test/api/kuwo/auth/qrcode'), env, ctx);
  assert.equal(login.status, 501);
});

test('site stats are aggregated from play history and account count', async t => {
  const env = testEnv(); t.after(() => env.sqlite.close());
  const now = Date.now();
  const user = await env.DB.prepare(`
    INSERT INTO users (platform, platform_user_id, nickname, avatar, vip_type, cookie_cipher,
      token_hash, token_expires_at_ms, created_at_ms, last_login_at_ms)
    VALUES ('netease', '1001', '', '', 0, '', 'h', ?, ?, ?) RETURNING id
  `).bind(now + 1000, now, now).first();
  await env.DB.prepare(`
    INSERT INTO play_stats (user_id, playlist_id, song_id, song_name, artist, duration_ms, play_count, last_played_at_ms)
    VALUES (?, '1', 'a', 'A', '', 200000, 3, ?), (?, '2', 'b', 'B', '', 100000, 1, ?)
  `).bind(user.id, now, user.id, now).run();

  const stats = await readSiteStats(env);
  assert.equal(stats.plays, 4);
  assert.equal(stats.playDurationMs, 700000);
  assert.equal(stats.songs, 2);
  assert.equal(stats.playlists, 2);
  assert.equal(stats.listeners, 1);
  assert.ok(stats.updatedAt > 0);

  // 未过期的缓存不重复扫描
  const again = await readSiteStats(env);
  assert.equal(again.updatedAt, stats.updatedAt);

  await refreshSiteStats(env);
  assert.equal((await readSiteStats(env)).plays, 4);
});

test('telemetry classifies every platform prefix', () => {
  assert.equal(routeKey('/api/qq/playlist/generate'), 'playlist.generate');
  assert.equal(routeKey('/api/kugou/playlist/generate'), 'playlist.generate');
  assert.equal(routeKey('/api/kuwo/playlist/m3u8/t/1/stream.m3u8'), 'playlist.stream');
  assert.equal(routeKey('/api/kugou/song/t/hash.mp3'), 'song.segment');
  assert.equal(routeKey('/api/stats'), 'stats');
  assert.equal(routeKey('/api/unknown'), 'other');
});
