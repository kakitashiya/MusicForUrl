// Analytics Engine 遥测。绝不承载正确性：绑定缺失、写入失败或超额都只影响分析数据，
// 因此所有写入都经过存在性检查与 try/catch，UI 读取一律走 D1。
const PLAY_EVENT_SAMPLE = 1;
const REQUEST_TELEMETRY_SAMPLE_DEFAULT = 10;

const ROUTE_PATTERNS = [
  [/^\/api\/health$/, 'health'],
  [/^\/api\/player\/capabilities$/, 'player.capabilities'],
  [/^\/api\/player\/playlist$/, 'player.playlist'],
  [/^\/api\/player\/resolve\//, 'player.resolve'],
  [/^\/api\/player\/media\//, 'player.media'],
  [/^\/api\/player\/cover\//, 'player.cover'],
  [/^\/api\/(?:qq\/)?playlist\/m3u8\//, 'playlist.stream'],
  [/^\/api\/(?:qq\/)?song\//, 'song.segment'],
  [/^\/api\/(?:qq\/)?playlist\/parse$/, 'playlist.parse'],
  [/^\/api\/(?:qq\/)?playlist\/url$/, 'playlist.url'],
  [/^\/api\/(?:qq\/)?playlist\/generate$/, 'playlist.generate'],
  [/^\/api\/(?:qq\/)?playlist\/user$/, 'playlist.user'],
  [/^\/api\/(?:qq\/)?auth\//, 'auth'],
  [/^\/api\/(?:qq\/)?favorites/, 'favorites'],
  [/^\/api\/(?:qq\/)?history\//, 'history'],
];

// 媒体与分片请求已经由播放事件覆盖，再记一次会让遥测先于请求数撞上每日 10 万点上限
const PLAYBACK_ROUTE_KEYS = new Set(['song.segment', 'player.media']);

function truncate(value, max) {
  return String(value ?? '').slice(0, max);
}

function emit(dataset, point) {
  if (!dataset || typeof dataset.writeDataPoint !== 'function') return false;
  try {
    dataset.writeDataPoint(point);
    return true;
  } catch (error) {
    console.warn('[Telemetry]', error.message);
    return false;
  }
}

function routeKey(pathname) {
  for (const [pattern, key] of ROUTE_PATTERNS) {
    if (pattern.test(pathname)) return key;
  }
  return 'other';
}

function telemetrySample(env) {
  const value = Number(env.REQUEST_TELEMETRY_SAMPLE);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 1000) : REQUEST_TELEMETRY_SAMPLE_DEFAULT;
}

function playEventPoint(env, {
  platform, userId, playlistId, song, quality, format, bitrate, trial, surface, cacheState, bytes, colo,
}) {
  return {
    indexes: [String(userId)],
    blobs: [
      'play', truncate(platform, 8), truncate(playlistId, 32), truncate(song?.id, 32),
      truncate(song?.name, 120), truncate(song?.artist, 120), truncate(quality, 16),
      truncate(format, 8), truncate(surface, 16), truncate(colo, 8), truncate(cacheState, 8),
      truncate(env.DEPLOY_VERSION, 32),
    ],
    doubles: [
      Number(userId) || 0, Date.now(), Number(bitrate) || 0, Number(bytes) || 0,
      Number(song?.duration) || 0, trial ? 1 : 0,
    ],
  };
}

function recordPlayEvent(env, details) {
  if (Math.random() > PLAY_EVENT_SAMPLE) return false;
  return emit(env.ANALYTICS, playEventPoint(env, details));
}

function recordRequestEvent(env, request, url, status, durationMs) {
  if (!env.ANALYTICS_REQUESTS) return false;
  const key = routeKey(url.pathname);
  if (PLAYBACK_ROUTE_KEYS.has(key)) return false;
  const sample = telemetrySample(env);
  if (sample > 1 && Math.random() > 1 / sample) return false;
  return emit(env.ANALYTICS_REQUESTS, {
    indexes: [key],
    blobs: [
      'req', key, truncate(request.method, 8), truncate(url.pathname.startsWith('/api/qq/') ? 'qq' : 'netease', 8),
      truncate(request.cf?.colo, 8), truncate(env.DEGRADE_MODE, 16),
    ],
    doubles: [Number(status) || 0, Number(durationMs) || 0, sample, Date.now()],
  });
}

export {
  PLAY_EVENT_SAMPLE, REQUEST_TELEMETRY_SAMPLE_DEFAULT,
  recordPlayEvent, recordRequestEvent, routeKey, telemetrySample,
};
