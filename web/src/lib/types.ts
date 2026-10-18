export type Platform = 'netease' | 'qq';
export type QualityId = 'low' | 'medium' | 'high' | 'lossless';

export interface AccountUser {
  userId: string;
  nickname: string;
  avatar: string;
  vipType: number;
}

export interface AuthStatus {
  logged: boolean;
  user?: AccountUser;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  cover: string;
  songCount?: number;
  trackCount?: number;
}

export interface FavoriteItem {
  playlistId: string;
  name: string;
  cover: string;
  nickname?: string | null;
  createdAt: string;
}

export interface HistoryItem {
  playlistId: string;
  name: string;
  cover: string;
  playedAt: string;
  playCount: number;
}

export interface TopSong {
  songId: string;
  songName: string;
  artist: string;
  playCount: number;
}

export interface UrlOption {
  type: string;
  label: string;
  url: string;
  note?: string;
}

export interface GeneratedLink {
  url: string;
  urls: UrlOption[];
  default: string;
  playlist?: PlaylistSummary;
}

export interface QualityOption {
  id: QualityId;
  label: string;
  format: string;
  bitrate: number | null;
  enabled: boolean;
  reason: string;
}

export interface Capabilities {
  backend: string;
  mp3Only: boolean;
  defaultQuality: QualityId;
  privateCache: boolean;
  degraded?: 'normal' | 'links-only' | 'shed';
  qualities: QualityOption[];
}

export interface PlayerTrack {
  id: string;
  name: string;
  artist: string;
  cover: string;
  duration: number;
}

export interface PlayerPlaylist {
  id: string;
  name: string;
  cover: string;
  platform: Platform;
  grant: string;
  tracks: PlayerTrack[];
}

export interface ResolvedSource {
  mediaUrl: string;
  coverUrl: string;
  song: PlayerTrack;
  requestedQuality: QualityId;
  quality: QualityId;
  format: string;
  bitrate: number | null;
  trial: boolean;
  warnings: string[];
  expiresAt: number;
}

export interface Paged<T> {
  data: T[];
  total: number;
}
