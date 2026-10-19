// 站点统计。
//
// 设计取舍：这些数字是「关于」页的门面，不值得为它增加播放路径上的写入。
//   - 累计解析歌曲数 / 生成链接数：每次解析歌单（/parse、/generate）与每次签发链接（/url、/generate）
//     各累加一次，低频写入，实时。旧版前端走 /parse + /url，新前端走 /generate，两条路径都计数。
//   - 累计播放次数 / 总播放时长 / 使用人数 / 收录曲目数：从 play_stats 与 users 聚合，
//     放在 cron 与按 TTL 触发的惰性刷新里算，绝不进入请求路径。
//
// 聚合是一次全表扫描，所以刷新频率由 STATS_REFRESH_MINUTES 控制（默认 60 分钟）。
// 播放量增长到扫描成本敏感时，把这个值调大即可，代价只是「关于」页的数字变旧。

const STATS_KEYS = ['parsedSongs', 'generatedLinks', 'plays', 'playDurationMs', 'listeners', 'songs', 'playlists'];
const DEFAULT_REFRESH_MINUTES = 60;
const MIN_REFRESH_MINUTES = 5;

// 刷新是 isolate 级的：并发请求不会同时发起同一个全表扫描
let refreshing = null;

function refreshMinutes(env) {
  const value = Number(env?.STATS_REFRESH_MINUTES);
  return Number.isInteger(value) && value >= MIN_REFRESH_MINUTES ? value : DEFAULT_REFRESH_MINUTES;
}

function emptyStats() {
  return {
    parsedSongs: 0, generatedLinks: 0, plays: 0, playDurationMs: 0,
    listeners: 0, songs: 0, playlists: 0, updatedAt: 0,
  };
}

/**
 * 解析/签发链接时累加，批量写入一次往返。
 *
 * 旧版前端走 /parse + /url，新前端走 /generate，因此两个入口都要计数：
 * 每份被解析的歌单记一次 parsedSongs，每签发一个播放链接记一次 generatedLinks。
 * 失败只影响统计，绝不影响生成结果。
 */
async function bumpParsedSongs(env, songCount, links = 0) {
  const songs = Math.max(0, Number(songCount) || 0);
  const count = Math.max(0, Number(links) || 0);
  if (!songs && !count) return;
  const now = Date.now();
  const bump = (key, value) => env.DB.prepare(`
    INSERT INTO site_stats (key, value, updated_at_ms) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = site_stats.value + excluded.value
  `).bind(key, value, now);
  const statements = [];
  if (songs) statements.push(bump('parsedSongs', songs));
  if (count) statements.push(bump('generatedLinks', count));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.warn('[Stats] bump failed', error.message);
  }
}

/** 重算派生指标。只有 cron 与惰性刷新会调用。 */
async function refreshSiteStats(env) {
  const now = Date.now();
  const derived = await env.DB.prepare(`
    SELECT COALESCE(SUM(play_count), 0) AS plays,
      COALESCE(SUM(play_count * duration_ms), 0) AS duration,
      COUNT(*) AS songs,
      COUNT(DISTINCT playlist_id) AS playlists
    FROM play_stats
  `).first();
  const users = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();

  const rows = [
    ['plays', Number(derived?.plays) || 0],
    ['playDurationMs', Number(derived?.duration) || 0],
    ['songs', Number(derived?.songs) || 0],
    ['playlists', Number(derived?.playlists) || 0],
    ['listeners', Number(users?.total) || 0],
  ];
  await env.DB.batch(rows.map(([key, value]) => env.DB.prepare(`
    INSERT INTO site_stats (key, value, updated_at_ms) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms
  `).bind(key, value, now)));
  return now;
}

async function readRows(env) {
  const result = await env.DB.prepare('SELECT key, value, updated_at_ms FROM site_stats').all();
  const stats = emptyStats();
  for (const row of result.results || []) {
    if (STATS_KEYS.includes(row.key)) stats[row.key] = Number(row.value) || 0;
    stats.updatedAt = Math.max(stats.updatedAt, Number(row.updated_at_ms) || 0);
  }
  return stats;
}

/**
 * 读统计。数据过期时同步刷新一次再返回，保证「关于」页的数字不会长期停在 0；
 * 刷新失败（例如额度耗尽）只退回旧值，不抛错。
 */
async function readSiteStats(env) {
  const stats = await readRows(env);
  if (stats.updatedAt && Date.now() - stats.updatedAt < refreshMinutes(env) * 60 * 1000) return stats;

  // 并发请求共用同一次刷新，避免同时发起多个全表扫描
  refreshing ||= refreshSiteStats(env).finally(() => { refreshing = null; });
  try {
    await refreshing;
    return await readRows(env);
  } catch (error) {
    console.warn('[Stats]', error.message);
    return stats;
  }
}

export { STATS_KEYS, bumpParsedSongs, readSiteStats, refreshMinutes, refreshSiteStats };
