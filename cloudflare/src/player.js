import playerApi from '../../lib/player-api.js';
import policy from '../../lib/player-policy.js';
import cache from '../../lib/player-cache.js';
import qqmusic from '../../lib/qqmusic.js';
import * as netease from './netease.js';
import { createPlaybackToken, decryptCookie, getPlaybackUser, getSessionUser, sha256Hex } from './security.js';
import { getPlaylist } from './playlists.js';
import { recordPlayback } from './playback-history.js';
import { recordPlayEvent } from './telemetry.js';
import { degradeMode } from './degrade.js';

const resolving = new Map();
const cacheEnabled = env => env.AUDIO_CACHE && String(env.AUDIO_CACHE_ENABLED) === 'true';
// 音源解析结果只活 90 秒，放进 D1 会让每次解析都产生一次写入；Cache API 无写入成本。
const RESOLVE_CACHE_TTL_SECONDS = 90;
const resolveCacheApi = env => String(env.RESOLVE_CACHE || 'cache_api') !== 'd1'
  && typeof caches !== 'undefined' && !!caches.default;

function r2Storage(bucket) {
  return {
    async get(key, range) {
      const object = await bucket.get(key, range ? { range: new Headers({ range }) } : undefined);
      if (!object) return null;
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('accept-ranges', 'bytes');
      let status = 200;
      if (range && object.range) {
        const offset = object.range.offset || 0;
        const length = object.range.length || object.size - offset;
        headers.set('content-length', String(length));
        headers.set('content-range', 'bytes ' + offset + '-' + (offset + length - 1) + '/' + object.size);
        status = 206;
      } else headers.set('content-length', String(object.size));
      return { response: new Response(object.body, { status, headers }), expiresAt: Number(object.customMetadata?.expiresAt) || 0 };
    },
    put(key, bytes, meta) { return bucket.put(key, bytes, {
      httpMetadata: { contentType: meta.contentType }, customMetadata: { expiresAt: String(meta.expiresAt) },
    }); },
    delete(key) { return bucket.delete(key); },
  };
}

// 会话令牌轮换（重新登录、退出）不应让已缓存的音源失效，所以键只到账号维度。
// 不同账号的 user.id 不同，因此不会跨账号共享权限相关的解析结果。
function resolveCacheKey(user, songId, quality) {
  return sha256Hex([user.platform, user.id, songId, quality].join(':'));
}

// Cache API 的键必须是绝对 URL，裸哈希会被拒绝。
const RESOLVE_CACHE_ORIGIN = 'https://resolve.mfu.internal/';

async function readResolveCache(env, key) {
  if (!resolveCacheApi(env)) {
    const row = await env.DB.prepare('SELECT source_json FROM song_sources WHERE cache_key = ? AND expires_at_ms > ?')
      .bind(key, Date.now()).first();
    if (!row) return null;
    try { return JSON.parse(row.source_json); } catch (_) { return null; }
  }
  try {
    const hit = await caches.default.match(RESOLVE_CACHE_ORIGIN + key);
    if (!hit) return null;
    const source = await hit.json();
    // Cache API 的 TTL 不够精确，以载荷内的 expiresAt 为准
    return source && Number(source.expiresAt) > Date.now() ? source : null;
  } catch (error) {
    console.warn('[Resolve cache read]', error.message);
    return null;
  }
}

function writeResolveCache(env, ctx, key, source) {
  if (!resolveCacheApi(env)) {
    return env.DB.prepare(`
      INSERT INTO song_sources (cache_key, source_json, expires_at_ms) VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET source_json = excluded.source_json, expires_at_ms = excluded.expires_at_ms
    `).bind(key, JSON.stringify(source), source.expiresAt).run();
  }
  const response = new Response(JSON.stringify(source), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `max-age=${RESOLVE_CACHE_TTL_SECONDS}`,
    },
  });
  const put = caches.default.put(RESOLVE_CACHE_ORIGIN + key, response)
    .catch((error) => console.warn('[Resolve cache write]', error.message));
  return ctx?.waitUntil ? ctx.waitUntil(put) : put;
}

async function resolvePlayerSource(env, user, songId, quality, fresh = false, ctx) {
  const key = await resolveCacheKey(user, songId, quality);
  if (!fresh) {
    const cached = await readResolveCache(env, key);
    if (cached) return cached;
    if (resolving.has(key)) return resolving.get(key);
  }
  const promise = (async () => {
    const cookie = await decryptCookie(env, user);
    const source = await policy.resolveQuality(
      candidate => user.platform === 'qq' ? qqmusic.getSongResource(songId, cookie, candidate, 1)
        : netease.getSongResource(songId, cookie, { ...env, MUSIC_QUALITY: candidate }),
      quality, true,
    );
    source.url = policy.allowedSource(source.url, user.platform);
    if (!source.url) throw new policy.PlayerError('音源地址不受支持', 502);
    const expires = Math.min(source.expiresAt || Date.now() + 60000, Date.now() + RESOLVE_CACHE_TTL_SECONDS * 1000);
    source.expiresAt = expires;
    await writeResolveCache(env, ctx, key, source);
    return source;
  })();
  resolving.set(key, promise);
  try { return await promise; } finally { if (resolving.get(key) === promise) resolving.delete(key); }
}

// R2 Class A 免费额度是 100 万次/月，而冷播放每次歌单会产生 30 次填充写入，
// 所以填充比例必须可调：额度吃紧时降低它，缓存只是延迟与上游带宽优化。
function fillRate(env) {
  const value = Number(env.AUDIO_CACHE_FILL_RATE);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}

async function proxyPlayerSource(request, env, ctx, user, songId, resource, image = false, fill = true) {
  const source = image ? policy.allowedSource(resource.url, user.platform, true) : resource.url;
  if (!source) return env.ASSETS.fetch(new Request(new URL('/placeholder.svg', request.url)));
  const identity = image ? source : [user.platform, user.id, songId,
    resource.quality, resource.format, resource.bitrate, !!resource.trial, new URL(source).pathname].join(':');
  const key = (image ? 'cover/v2/' : 'audio/v2/') + await sha256Hex(identity);
  return cache.proxySource(request, {
    source, platform: user.platform, key, ctx, image, fill,
    storage: cacheEnabled(env) ? r2Storage(env.AUDIO_CACHE) : null,
    ttl: image ? 86400 : 3600,
    maxConcurrentWrites: 2,
    fillOnRange: false,
    fillRate: fillRate(env),
    // 封面是不含用户信息的公开图片，允许浏览器复用，减少 Worker 请求
    cacheControl: image ? 'public, max-age=86400, immutable' : undefined,
  });
}

// 网页播放器每首歌会打 2 次请求，每次都要拿一遍歌单；isolate 内记忆化可以省掉
// 重复的 D1 读取和整份 songs_json 的解析。
const PLAYLIST_MEMO_TTL_MS = 60000;
const PLAYLIST_MEMO_MAX = 32;
const playlistMemo = new Map();

async function cachedPlaylist(env, user, id) {
  const key = `${user.platform}:${user.id}:${id}`;
  const hit = playlistMemo.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await getPlaylist(env, user, id);
  if (playlistMemo.size >= PLAYLIST_MEMO_MAX) playlistMemo.delete(playlistMemo.keys().next().value);
  playlistMemo.set(key, { value, expiresAt: Date.now() + PLAYLIST_MEMO_TTL_MS });
  return value;
}

function handlePlayer(request, env, ctx) {
  const services = {
    capabilities: () => ({
      ...policy.capabilities('cloudflare', env.MUSIC_QUALITY, !!cacheEnabled(env)),
      degraded: degradeMode(env),
    }),
    session: (req, platform) => getSessionUser(env, req, platform),
    verifyGrant: (grant, platform, id) => getPlaybackUser(env, grant, platform, id),
    mintGrant: (user, id) => createPlaybackToken(env, user, id),
    playlist: (user, id) => cachedPlaylist(env, user, id),
    resolve: (user, songId, quality, fresh) => resolvePlayerSource(env, user, songId, quality, fresh, ctx),
    cover: (req, user, url, song) => proxyPlayerSource(req, env, ctx, user, song.id, { url }, true),
    async media(req, user, song, id, source) {
      const response = await proxyPlayerSource(req, env, ctx, user, song.id, source);
      return req.method === 'HEAD' ? response : cache.trackTransfer(response, () =>
        ctx.waitUntil(recordPlayback(env, user.id, id, song)
          .then(() => recordPlayEvent(env, {
            platform: user.platform, userId: user.id, playlistId: id, song,
            quality: source.quality, format: source.format, bitrate: source.bitrate,
            trial: source.trial, surface: 'player',
            cacheState: response.headers.get('x-mfu-cache') || '', colo: req.cf?.colo,
          }))
          .catch(error => console.error('[Player history]', error.message))));
    },
  };
  return playerApi.createPlayerApi(services)(request);
}

export { handlePlayer, resolvePlayerSource, proxyPlayerSource };
