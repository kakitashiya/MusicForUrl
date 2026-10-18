import { create } from 'zustand';
import { readPlayerMuted, readPlayerVolume, writePlayerMuted, writePlayerVolume } from '../lib/storage';

/** 音量步进：方向键与点击轨道都按 5% 走，键盘用户可以精细调节。 */
export const VOLUME_STEP = 0.05;

interface VolumeState {
  /** 0–1。静音时保留原值，取消静音后能回到原来的音量。 */
  volume: number;
  muted: boolean;
  setVolume(volume: number): void;
  /** 相对调整，用于键盘与滚轮 */
  nudge(delta: number): void;
  toggleMute(): void;
  /** 静音状态下调整音量视为「取消静音并设为该值」，这是各家播放器的通行行为 */
  unmute(): void;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export const useVolume = create<VolumeState>((set, get) => ({
  volume: readPlayerVolume(),
  muted: readPlayerMuted(),

  setVolume(volume) {
    const next = clamp(volume);
    writePlayerVolume(next);
    // 拖到 0 等价于静音，从 0 拖起来等价于取消静音，避免出现「有音量但不响」
    const muted = next === 0;
    writePlayerMuted(muted);
    set({ volume: next, muted });
  },

  nudge(delta) {
    get().setVolume(get().volume + delta);
  },

  toggleMute() {
    const muted = !get().muted;
    writePlayerMuted(muted);
    set({ muted });
  },

  unmute() {
    if (!get().muted) return;
    writePlayerMuted(false);
    set({ muted: false });
  },
}));

/** 实际作用到媒体元素上的音量。静音与音量 0 是同一个结果。 */
export function effectiveVolume(state: Pick<VolumeState, 'volume' | 'muted'>): number {
  return state.muted ? 0 : state.volume;
}
