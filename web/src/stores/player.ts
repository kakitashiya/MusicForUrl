import { create } from 'zustand';
import { api } from '../lib/api';
import { readPlayerQuality, writePlayerQuality } from '../lib/storage';
import type { Platform, PlayerPlaylist, QualityId, ResolvedSource } from '../lib/types';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface PlayerState {
  playlist: PlayerPlaylist | null;
  index: number;
  quality: QualityId;
  source: ResolvedSource | null;
  status: PlayerStatus;
  message: string;
  autoplay: boolean;
  generation: number;

  open(platform: Platform, playlistId: string, grant?: string): Promise<void>;
  playIndex(index: number): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setQuality(quality: QualityId): Promise<void>;
  retry(): Promise<void>;
  markPlaying(): void;
  markPaused(): void;
  markEnded(): void;
  fail(message: string): void;
  clear(): void;
}

const initialQuality = (): QualityId => readPlayerQuality() || 'low';

export const usePlayer = create<PlayerState>((set, get) => {
  let inFlight: AbortController | null = null;

  async function load(index: number, options: { fresh?: boolean; autoplay?: boolean } = {}) {
    const { playlist, quality } = get();
    if (!playlist) return;
    const track = playlist.tracks[index];
    if (!track) return;

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    const generation = get().generation + 1;
    set({
      index,
      status: 'loading',
      message: '',
      generation,
      autoplay: options.autoplay ?? true,
    });

    try {
      const source = await api.resolve(playlist.platform, {
        playlistId: playlist.id,
        grant: playlist.grant,
        songId: track.id,
        quality,
        fresh: options.fresh,
      });
      if (get().generation !== generation) return;
      set({ source, status: 'loading', message: source.warnings.join(' ') });
    } catch (error) {
      if (get().generation !== generation) return;
      set({
        status: 'error',
        source: null,
        message: error instanceof Error ? error.message : '音源加载失败',
      });
    }
  }

  return {
    playlist: null,
    index: 0,
    quality: initialQuality(),
    source: null,
    status: 'idle',
    message: '',
    autoplay: true,
    generation: 0,

    async open(platform, playlistId, grant = '') {
      inFlight?.abort();
      set({ status: 'loading', message: '', source: null, playlist: null });
      try {
        const playlist = await api.playerPlaylist(platform, playlistId, grant);
        if (!playlist.tracks.length) {
          set({ status: 'error', message: '这个歌单里没有可播放的歌曲' });
          return;
        }
        set({ playlist });
        await load(0, { autoplay: true });
      } catch (error) {
        set({ status: 'error', message: error instanceof Error ? error.message : '歌单加载失败' });
      }
    },

    playIndex(index) { return load(index, { autoplay: true }); },

    async next() {
      const { playlist, index } = get();
      if (!playlist) return;
      if (index + 1 >= playlist.tracks.length) {
        set({ status: 'ended', message: '歌单播放结束' });
        return;
      }
      await load(index + 1, { autoplay: true });
    },

    async prev() {
      const { index } = get();
      if (index <= 0) return;
      await load(index - 1, { autoplay: true });
    },

    async setQuality(quality) {
      writePlayerQuality(quality);
      set({ quality });
      await load(get().index, { autoplay: true });
    },

    // 播放出错时保留进度重试一次，与旧版行为一致
    async retry() {
      await load(get().index, { fresh: true, autoplay: true });
    },

    markPlaying() { set({ status: 'playing' }); },
    markPaused() { set({ status: 'paused' }); },
    markEnded() { set({ status: 'ended' }); },
    fail(message) { set({ status: 'error', message }); },

    clear() {
      inFlight?.abort();
      inFlight = null;
      set({
        playlist: null, index: 0, source: null, status: 'idle', message: '',
        autoplay: false, generation: get().generation + 1,
      });
    },
  };
});

export function currentTrack(state: PlayerState) {
  return state.playlist?.tracks[state.index] ?? null;
}
