// Analytics Engine 遥测。绝不承载正确性：绑定缺失、写入失败或超额都只影响分析数据，
// 因此所有写入都经过存在性检查与 try/catch，UI 读取一律走 D1。
const PLAY_EVENT_SAMPLE = 1;
const REQUEST_TELEMETRY_SAMPLE_DEFAULT = 10;

// 平台前缀集中在这里，新增平台时改一处即可。顺序无关，因为都是锚定的完整前缀。
const PLATFORM_PREFIX = '(?:qq|kugou|kuwo)?\\/?';

const ROUTE_PATTERNS = [
  [/^\/api\/health$/, 'health'],
  [/^\/api\/stats$/, 'stats'],
  [/^\/api\/player\/capabilities$/, 'player.capabilities'],
  [/^\/api\/player\/playlist$/, 'player.playlist'],
  [/^\/api\/player\/resolve\//, 'player.resolve'],
  [/^\/api\/player\/media\//, 'player.media'],
  [/^\/api\/player\/cover\//, 'player.cover'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}playlist/m3u8/`), 'playlist.stream'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}song/`), 'song.segment'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}playlist/parse$`), 'playlist.parse'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}playlist/url$`), 'playlist.url'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}playlist/generate$`), 'playlist.generate'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}playlist/user$`), 'playlist.user'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}auth/`), 'auth'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}favorites`), 'favorites'],
  [new RegExp(`^/api/${PLATFORM_PREFIX}history/`), 'history'],
];

// 从路径里取平台标识，用于遥测的 blob 维度
function platformOfPath(pathname) {
  const match = pathname.match(/^\/api\/(qq|kugou|kuwo)(?:\/|$)/);
  return match ? match[1] : 'netease';
}

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
      'req', key, truncate(request.method, 8), truncate(platformOfPath(url.pathname), 8),
      truncate(request.cf?.colo, 8), truncate(env.DEGRADE_MODE, 16),
    ],
    doubles: [Number(status) || 0, Number(durationMs) || 0, sample, Date.now()],
  });
}

export {
  PLAY_EVENT_SAMPLE, REQUEST_TELEMETRY_SAMPLE_DEFAULT,
  platformOfPath, recordPlayEvent, recordRequestEvent, routeKey, telemetrySample,
};
