import { readToken } from './storage';
import type {
  AccountUser, AuthStatus, Capabilities, FavoriteItem, GeneratedLink, HistoryItem,
  Paged, Platform, PlayerPlaylist, PlaylistSummary, QualityId, ResolvedSource, TopSong,
} from './types';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'unknown', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

export function apiPath(platform: Platform, path: string): string {
  return platform === 'qq' ? `/api/qq${path}` : `/api${path}`;
}

async function request<T>(path: string, platform: Platform, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.token ?? readToken(platform);
  if (token) headers[platform === 'qq' ? 'x-qq-token' : 'x-token'] = token;
  const init: RequestInit = { method: options.method ?? 'GET', headers, cache: 'no-store' };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  let payload: { success?: boolean; message?: string; code?: string; data?: unknown; total?: number } | null = null;
  try { payload = await response.json(); } catch { /* 额度耗尽等情况下可能不是 JSON */ }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.message || `请求失败（HTTP ${response.status}）`,
      payload?.code || 'http_error',
      response.status,
    );
  }
  return payload as T;
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  authStatus(platform: Platform): Promise<AuthStatus> {
    return request<{ data: AuthStatus }>(apiPath(platform, '/auth/status'), platform)
      .then(result => result.data);
  },
  logout(platform: Platform): Promise<void> {
    return request(apiPath(platform, '/auth/logout'), platform, { method: 'POST', body: {} })
      .then(() => undefined);
  },

  qrcode(platform: Platform) {
    return request<{ data: { key: string; qrimg: string } }>(apiPath(platform, '/auth/qrcode'), platform)
      .then(result => result.data);
  },
  qrcodeCheck(platform: Platform, key: string, signal?: AbortSignal) {
    return request<{ code: number; message?: string; data?: { token: string; user: AccountUser } }>(
      apiPath(platform, `/auth/qrcode/check${query({ key })}`), platform, { signal },
    );
  },
  sendCaptcha(platform: Platform, phone: string) {
    return request<{ success: boolean; message: string }>(
      apiPath(platform, '/auth/captcha/send'), platform, { method: 'POST', body: { phone } },
    );
  },
  loginCaptcha(platform: Platform, phone: string, captcha: string) {
    return request<{ data: { token: string; user: AccountUser } }>(
      apiPath(platform, '/auth/login/captcha'), platform, { method: 'POST', body: { phone, captcha } },
    ).then(result => result.data);
  },
  loginPassword(platform: Platform, phone: string, password: string) {
    return request<{ data: { token: string; user: AccountUser } }>(
      apiPath(platform, '/auth/login/password'), platform, { method: 'POST', body: { phone, password } },
    ).then(result => result.data);
  },
  loginCookie(platform: Platform, cookie: string) {
    return request<{ data: { token: string; user: AccountUser } }>(
      apiPath(platform, '/auth/login/cookie'), platform, { method: 'POST', body: { cookie } },
    ).then(result => result.data);
  },

  // 一次请求完成解析 → 取歌单 → 签发链接，替代连续的 /parse + /url
  generate(platform: Platform, url: string): Promise<GeneratedLink> {
    return request<{ data: GeneratedLink }>(
      apiPath(platform, '/playlist/generate'), platform, { method: 'POST', body: { url } },
    ).then(result => result.data);
  },

  userPlaylists(platform: Platform, offset: number, limit: number): Promise<Paged<PlaylistSummary>> {
    return request<{ data: PlaylistSummary[]; total: number }>(
      apiPath(platform, `/playlist/user${query({ offset, limit })}`), platform,
    );
  },
  favorites(platform: Platform, offset: number, limit: number): Promise<Paged<FavoriteItem>> {
    return request<{ data: FavoriteItem[]; total: number }>(
      apiPath(platform, `/favorites${query({ offset, limit })}`), platform,
    );
  },
  favoriteCheck(platform: Platform, playlistId: string) {
    return request<{ data: { favorited: boolean } }>(
      apiPath(platform, `/favorites/check/${playlistId}`), platform,
    ).then(result => result.data.favorited);
  },
  addFavorite(platform: Platform, item: { playlistId: string; playlistName: string; playlistCover: string }) {
    return request(apiPath(platform, '/favorites'), platform, { method: 'POST', body: item });
  },
  removeFavorite(platform: Platform, playlistId: string) {
    return request(apiPath(platform, `/favorites/${playlistId}`), platform, { method: 'DELETE' });
  },
  recent(platform: Platform, offset: number, limit: number): Promise<Paged<HistoryItem>> {
    return request<{ data: HistoryItem[]; total: number }>(
      apiPath(platform, `/history/recent${query({ offset, limit })}`), platform,
    );
  },
  top(platform: Platform, limit: number): Promise<TopSong[]> {
    return request<{ data: TopSong[] }>(apiPath(platform, `/history/top${query({ limit })}`), platform)
      .then(result => result.data);
  },

  capabilities(): Promise<Capabilities> {
    return request<{ data: Capabilities }>('/api/player/capabilities', 'netease')
      .then(result => result.data);
  },
  playerPlaylist(platform: Platform, playlistId: string, grant = ''): Promise<PlayerPlaylist> {
    return request<{ data: PlayerPlaylist }>(
      `/api/player/playlist${query({ platform, id: playlistId, grant })}`, platform, { token: grant || undefined },
    ).then(result => result.data);
  },
  resolve(platform: Platform, options: {
    playlistId: string; grant?: string; songId: string; quality: QualityId; fresh?: boolean;
  }): Promise<ResolvedSource> {
    const { playlistId, grant = '', songId, quality, fresh } = options;
    return request<{ data: ResolvedSource }>(
      `/api/player/resolve/${songId}${query({ platform, id: playlistId, grant, quality, fresh: fresh ? 1 : undefined })}`,
      platform,
      { token: grant || undefined },
    ).then(result => result.data);
  },
};

// 歌单播放地址可以直接交给 hls.js / <audio>，因此不走 fetch 包装
export function streamUrl(platform: Platform, playlistId: string, grant: string): string {
  const prefix = platform === 'qq' ? '/api/qq/playlist' : '/api/playlist';
  return `${prefix}/m3u8/${encodeURIComponent(grant)}/${playlistId}/stream.m3u8`;
}

// 本站生成的 M3U8 链接可以反解出歌单与播放令牌，用于预览页粘贴
export function parseStreamUrl(value: string): { platform: Platform; playlistId: string; grant: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const match = url.pathname.match(/^\/api\/(qq\/)?playlist\/m3u8\/([^/]+)\/(\d{1,20})\/stream\.m3u8$/);
  if (!match) return null;
  return {
    platform: match[1] ? 'qq' : 'netease',
    grant: decodeURIComponent(match[2]),
    playlistId: match[3],
  };
}
