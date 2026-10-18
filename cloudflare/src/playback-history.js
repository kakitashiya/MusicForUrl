const PLAY_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PLAY_LOG_DEDUP_MS = 5 * 60 * 1000;
const PLAY_LOG_MAX_PER_MINUTE = 12;

// One admitted play is one row written. Replays of the same song in the same playlist
// update a single aggregate row instead of appending an event, which is what keeps a
// 30-track playlist inside the free plan's daily D1 write budget. Admission (5 minute
// dedup, 12 distinct songs per rolling minute) lives in the SELECT guards, so a
// rejected play writes nothing and returns null.
//
// duration_ms 只用于「关于」页的总播放时长，跟着歌曲元数据更新，不额外产生写入。
async function recordPlayback(env, userId, playlistId, song, now = Date.now()) {
  const durationMs = Math.max(0, Math.round(Number(song?.duration) || 0)) * 1000;
  const row = await env.DB.prepare(`
    INSERT INTO play_stats (user_id, playlist_id, song_id, song_name, artist, duration_ms, play_count, last_played_at_ms)
    SELECT ?, ?, ?, ?, ?, ?, 1, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM play_stats
      WHERE user_id = ? AND playlist_id = ? AND song_id = ? AND last_played_at_ms >= ?
    ) AND (
      SELECT COUNT(*) FROM play_stats WHERE user_id = ? AND last_played_at_ms >= ?
    ) < ?
    ON CONFLICT (user_id, playlist_id, song_id) DO UPDATE SET
      play_count = play_stats.play_count + 1,
      last_played_at_ms = excluded.last_played_at_ms,
      song_name = excluded.song_name,
      artist = excluded.artist,
      duration_ms = excluded.duration_ms
    RETURNING play_count, last_played_at_ms
  `).bind(
    userId, playlistId, String(song.id), String(song.name || ''), String(song.artist || ''),
    durationMs, now,
    userId, playlistId, String(song.id), now - PLAY_LOG_DEDUP_MS,
    userId, now - 60000, PLAY_LOG_MAX_PER_MINUTE,
  ).first();
  return row || null;
}

async function prunePlaybackLogs(env, now = Date.now()) {
  return env.DB.prepare('DELETE FROM play_stats WHERE last_played_at_ms < ?')
    .bind(now - PLAY_LOG_RETENTION_MS).run();
}

export {
  PLAY_LOG_DEDUP_MS, PLAY_LOG_MAX_PER_MINUTE,
  PLAY_LOG_RETENTION_MS, prunePlaybackLogs, recordPlayback,
};
